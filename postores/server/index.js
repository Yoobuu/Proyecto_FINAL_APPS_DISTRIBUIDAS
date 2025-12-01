require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || '0.0.0.0';
const MANEJADOR_URL = process.env.MANEJADOR_URL || 'http://localhost:8080';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

let configuracionLocal = null;
let subastas = [];
let registros = {};
let historialGlobal = [];
let ioInstance = null;
let stateInterval = null;

const numeroSeguro = (valor, fallback = 0) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : fallback;
};

const ordenarLista = () => {
  if (!configuracionLocal || !Array.isArray(subastas)) return [];
  const mapa = new Map(subastas.map((s) => [s.id, s]));
  const usados = new Set();
  const enOrden = (configuracionLocal.orden || [])
    .map((id) => {
      const item = mapa.get(id);
      if (item) usados.add(id);
      return item || null;
    })
    .filter(Boolean);
  const restantes = subastas.filter((s) => !usados.has(s.id));
  return [...enOrden, ...restantes];
};

const emitirConfigActualizada = () => {
  if (!ioInstance || !configuracionLocal) return;
  ioInstance.emit('config:updated', { ...configuracionLocal, obras: ordenarLista() });
};

const emitirResetConfig = () => {
  if (!ioInstance) return;
  ioInstance.emit('config:reset');
};

const calcularLineaDeTiempo = (config) => {
  const orden = Array.isArray(config?.orden) && config.orden.length
    ? config.orden
    : Array.isArray(config?.obras)
      ? config.obras.map((o) => o.id)
      : [];
  const startAt = { ...(config?.startAt || {}) };
  const endAt = { ...(config?.endAt || {}) };
  const base = typeof config?.creadoEn === 'number' ? config.creadoEn : Date.now();
  let offset = 0;

  orden.forEach((id) => {
    const inicio = typeof startAt[id] === 'number' ? startAt[id] : base + offset;
    const duracionSeg = numeroSeguro(config?.duracion?.[id], 0);
    const fin = typeof endAt[id] === 'number' ? endAt[id] : inicio + duracionSeg * 1000;
    startAt[id] = inicio;
    endAt[id] = fin;
    offset += duracionSeg * 1000;
  });

  return { startAt, endAt };
};

const validarConfigEntrante = (config) => {
  const obras = Array.isArray(config?.obras) ? config.obras : [];
  const orden = Array.isArray(config?.orden) && config.orden.length ? config.orden : obras.map((o) => o.id);
  if (!orden.length || orden.length !== obras.length || new Set(orden).size !== orden.length) {
    throw new Error('Configuración inválida: orden incompleto o ids duplicados.');
  }
  obras.forEach((obra) => {
    const precio = numeroSeguro(config?.precioBase?.[obra.id], obra.precioBase);
    const incremento = numeroSeguro(config?.incrementoMinimo?.[obra.id], obra.incrementoMinimo);
    const duracion = numeroSeguro(config?.duracion?.[obra.id], obra.duracion);
    if (precio < obra.precioBase) {
      throw new Error(`El precio inicial de "${obra.titulo || obra.id}" no puede ser menor al precio base.`);
    }
    if (incremento <= 0) {
      throw new Error(`Incremento mínimo inválido para "${obra.titulo || obra.id}".`);
    }
    if (duracion < 1) {
      throw new Error(`Duración inválida para "${obra.titulo || obra.id}".`);
    }
  });
};

const prepararDesdeConfig = (config) => {
  validarConfigEntrante(config);
  const obras = Array.isArray(config?.obras) ? config.obras : [];
  const orden = Array.isArray(config?.orden) && config.orden.length ? config.orden : obras.map((o) => o.id);
  const { startAt, endAt } = calcularLineaDeTiempo(config);

  const lista = orden
    .map((id) => {
      const obraBase = obras.find((o) => o.id === id);
      if (!obraBase) return null;
      const precioBase = numeroSeguro(config?.precioBase?.[id], obraBase.precioBase);
      const incremento = numeroSeguro(config?.incrementoMinimo?.[id], obraBase.incrementoMinimo ?? obraBase.minIncrement);
      const duracionSeg = numeroSeguro(config?.duracion?.[id], obraBase.duracion);
      const inicio = startAt[id];
      const fin = endAt[id] ?? (inicio ? inicio + duracionSeg * 1000 : null);
      return {
        ...obraBase,
        currentPrice: numeroSeguro(obraBase.currentPrice, precioBase),
        minIncrement: incremento,
        duracion: duracionSeg,
        startAt: inicio,
        endAt: fin,
        state: 'PENDING',
        bids: [],
        winner: null,
      };
    })
    .filter(Boolean);

  configuracionLocal = {
    estado: 'configurado',
    ...config,
    orden,
    startAt,
    endAt,
  };
  subastas = lista;
  registros = Object.fromEntries(subastas.map((s) => [s.id, []]));
  historialGlobal = [];

  if (stateInterval) clearInterval(stateInterval);
  stateInterval = setInterval(actualizarEstados, 1000);
  actualizarEstados();

  if (ioInstance) {
    subastas.forEach((subasta) => {
      ioInstance.emit('auction:updated', {
        id: subasta.id,
        state: subasta.state,
        currentPrice: subasta.currentPrice,
        startAt: subasta.startAt,
        endAt: subasta.endAt,
        minIncrement: subasta.minIncrement,
        winner: subasta.winner,
      });
    });
  }

  emitirConfigActualizada();
};

const obtenerConfigRemota = async () => {
  try {
    const response = await axios.get(`${MANEJADOR_URL}/api/config`, { timeout: 2500 });
    const data = response.data;
    if (!data || data.estado === 'no-configurado') return null;
    prepararDesdeConfig(data);
    return data;
  } catch (error) {
    return null;
  }
};

function cerrarSubasta(subasta) {
  if (!subasta || subasta.state === 'CLOSED') return;
  subasta.state = 'CLOSED';
  const ultimoBid = subasta.bids[subasta.bids.length - 1] || null;
  subasta.winner = ultimoBid ? { user: ultimoBid.user, amount: ultimoBid.amount } : null;
  const closedAt = Date.now();
  subasta.closedAt = closedAt;
  if (ioInstance) {
    ioInstance.emit('auction:closed', {
      id: subasta.id,
      state: subasta.state,
      winner: subasta.winner,
      currentPrice: subasta.currentPrice,
      closedAt,
      endAt: subasta.endAt,
      obra: subasta.titulo || subasta.title || subasta.id,
    });
    ioInstance.emit('auction:updated', {
      id: subasta.id,
      state: subasta.state,
      currentPrice: subasta.currentPrice,
      winner: subasta.winner,
      closedAt,
      endAt: subasta.endAt,
    });
  }
}

function actualizarEstados() {
  if (!subastas.length) return;
  const ahora = Date.now();

  subastas.forEach((subasta) => {
    if (subasta.state === 'PENDING' && subasta.startAt && ahora >= subasta.startAt) {
      subasta.state = 'ACTIVE';
      if (ioInstance) {
        const payload = {
          id: subasta.id,
          state: subasta.state,
          startAt: subasta.startAt,
          endAt: subasta.endAt,
          currentPrice: subasta.currentPrice,
          minIncrement: subasta.minIncrement,
        };
        ioInstance.emit('auction:opened', payload);
        ioInstance.emit('auction:updated', payload);
      }
    }

    if (subasta.state === 'ACTIVE' && subasta.endAt && ahora >= subasta.endAt) {
      cerrarSubasta(subasta);
    }

    if (ioInstance) {
      const segundosRestantes = subasta.startAt ? Math.max(0, Math.ceil((subasta.startAt - ahora) / 1000)) : null;
      const segundosParaFinalizar = subasta.endAt ? Math.max(0, Math.ceil((subasta.endAt - ahora) / 1000)) : null;
      ioInstance.emit('countdown', {
        id: subasta.id,
        startAt: subasta.startAt,
        endAt: subasta.endAt,
        segundosRestantes,
        segundosParaFinalizar,
        state: subasta.state,
      });
    }
  });
}

app.get('/api/auctions', async (req, res) => {
  if (!configuracionLocal) {
    await obtenerConfigRemota();
  }

  if (!configuracionLocal) {
    return res.json({ estado: 'no-configurado' });
  }

  actualizarEstados();
  res.json({ ...configuracionLocal, obras: ordenarLista() });
});

app.post('/api/config', (req, res) => {
  try {
    prepararDesdeConfig(req.body || {});
    res.json({ ok: true, subastas: subastas.length });
  } catch (error) {
    res.status(400).json({ error: error?.message || 'Configuración inválida' });
  }
});

app.post('/api/reset', (req, res) => {
  configuracionLocal = null;
  subastas = [];
  registros = {};
  historialGlobal = [];
  if (stateInterval) clearInterval(stateInterval);
  stateInterval = null;
  emitirResetConfig();
  res.json({ ok: true });
});

app.post('/api/auctions/:id/register', (req, res) => {
  if (!configuracionLocal) {
    return res.status(400).json({ error: 'Aún no hay configuración de subastas' });
  }

  const { id } = req.params;
  const { nombre } = req.body || {};

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const subasta = subastas.find((s) => s.id === id);
  if (!subasta) {
    return res.status(404).json({ error: 'Subasta no encontrada' });
  }

  if (subasta.state === 'CLOSED') {
    return res.status(400).json({ error: 'La subasta ya está cerrada.' });
  }

  if (!registros[id]) {
    registros[id] = [];
  }

  registros[id].push({
    nombre: nombre.trim(),
    timestamp: new Date().toISOString(),
  });

  if (ioInstance) {
    ioInstance.emit('nuevo-registro', { auctionId: id, registros: registros[id] });
  }
  res.json({ ok: true, auctionId: id, registros: registros[id] });
});

app.post('/api/auctions/:id/bid', (req, res) => {
  if (!configuracionLocal) {
    return res.status(400).json({ error: 'No se puede pujar porque no hay configuración activa.' });
  }

  const { id } = req.params;
  const { nombre, monto } = req.body || {};
  const amount = numeroSeguro(monto, NaN);

  const subasta = subastas.find((s) => s.id === id);
  if (!subasta) {
    return res.status(404).json({ error: 'Subasta no encontrada' });
  }

  actualizarEstados();

  const ahora = Date.now();

  if (subasta.state === 'PENDING' && subasta.startAt && ahora < subasta.startAt) {
    return res.status(400).json({ error: 'La subasta aún no inicia.' });
  }

  if (subasta.state !== 'ACTIVE') {
    const reason = 'La subasta no está activa.';
    if (ioInstance) ioInstance.emit('bid:rejected', { id, reason });
    return res.status(400).json({ error: reason });
  }

  if (subasta.endAt && ahora >= subasta.endAt) {
    cerrarSubasta(subasta);
    const reason = 'La subasta ya está cerrada.';
    if (ioInstance) ioInstance.emit('bid:rejected', { id, reason });
    return res.status(400).json({ error: reason });
  }

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    if (ioInstance) ioInstance.emit('bid:rejected', { id, reason: 'Nombre requerido' });
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const minimoRequerido = (subasta.currentPrice || subasta.precioBase || 0) + (subasta.minIncrement || 0);
  if (!Number.isFinite(amount) || amount < minimoRequerido) {
    const reason = `Monto inválido: debe ser al menos ${minimoRequerido}.`;
    if (ioInstance) ioInstance.emit('bid:rejected', { id, reason, minimoRequerido });
    return res.status(400).json({ error: reason });
  }

  const bid = { user: nombre.trim(), amount, time: ahora };
  subasta.currentPrice = amount;
  subasta.bids.push(bid);

  historialGlobal.push({
    id: subasta.id,
    obra: subasta.titulo || subasta.title || subasta.id,
    usuario: bid.user,
    monto: bid.amount,
    timestamp: ahora,
  });

  if (ioInstance) {
    const bidPayload = { id: subasta.id, ...bid, currentPrice: subasta.currentPrice };
    ioInstance.emit('bid:placed', {
      ...bidPayload,
      obra: subasta.titulo || subasta.title || subasta.id,
    });
    ioInstance.emit('auction:updated', {
      id: subasta.id,
      state: subasta.state,
      currentPrice: subasta.currentPrice,
      startAt: subasta.startAt,
      endAt: subasta.endAt,
      winner: subasta.winner,
    });
  }

  res.json({ ok: true, subasta });
});

app.get('/api/auctions/:id/registers', (req, res) => {
  if (!configuracionLocal) {
    return res.status(400).json({ error: 'Aún no hay configuración de subastas' });
  }
  const { id } = req.params;
  if (!registros[id]) {
    return res.json({ registros: [] });
  }
  res.json({ registros: registros[id] });
});

app.get('/api/history-global', (req, res) => {
  res.json({ items: historialGlobal });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
ioInstance = io;

io.on('connection', () => {});

server.listen(PORT, HOST, () => {
  console.log(`Postores escuchando en http://${HOST}:${PORT} apuntando a manejador ${MANEJADOR_URL}`);
});
