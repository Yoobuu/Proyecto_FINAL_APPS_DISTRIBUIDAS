require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const OBRAS_FILE = path.join(__dirname, 'obras_de_arte.json');
const POSTORES_URL = process.env.POSTORES_URL || 'http://localhost:8081';

let configuracion = null;

const cargarObras = () => {
  const raw = fs.readFileSync(OBRAS_FILE, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('Formato de obras inválido');
  }
  return data.map((obra) => ({
    ...obra,
    precioBase: Number(obra.precioBase) || 0,
    incrementoMinimo: Number(obra.incrementoMinimo) || 0,
    duracion: Number(obra.duracion) || 0,
  }));
};

const toNumberOrDefault = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const construirConfiguracion = (payload) => {
  const { orden, precioBase = {}, incrementoMinimo = {}, duracion = {} } = payload || {};
  const obras = cargarObras();
  const obrasPorId = new Map(obras.map((obra) => [obra.id, obra]));

  if (!Array.isArray(orden) || orden.length !== obras.length) {
    throw new Error('Debe incluir un orden válido con todas las obras.');
  }

  const idsUnicos = new Set(orden);
  if (idsUnicos.size !== orden.length || !orden.every((id) => obrasPorId.has(id))) {
    throw new Error('Orden inválido o con ids desconocidos.');
  }

  const precioBaseConfig = {};
  const incrementoConfig = {};
  const duracionConfig = {};
  const startAtMap = {};
  const endAtMap = {};

  const t0 = Date.now();
  let acumuladoMs = 0;

  const obrasConfiguradas = orden.map((id) => {
    const obraBase = obrasPorId.get(id);
    const precio = toNumberOrDefault(precioBase[id], obraBase.precioBase);
    const incremento = toNumberOrDefault(incrementoMinimo[id], obraBase.incrementoMinimo);
    const duracionEnSegundos = toNumberOrDefault(duracion[id], obraBase.duracion);

    if (precio < obraBase.precioBase) {
      throw new Error(`El precio inicial de "${obraBase.titulo}" no puede ser menor al precio base (${obraBase.precioBase}).`);
    }
    if (incremento <= 0) {
      throw new Error(`El incremento mínimo de "${obraBase.titulo}" debe ser mayor a 0.`);
    }
    if (duracionEnSegundos < 1) {
      throw new Error(`La duración de "${obraBase.titulo}" debe ser al menos 1 segundo.`);
    }

    precioBaseConfig[id] = precio;
    incrementoConfig[id] = incremento;
    duracionConfig[id] = duracionEnSegundos;

    const startAt = t0 + acumuladoMs;
    const endAt = startAt + duracionEnSegundos * 1000;
    startAtMap[id] = startAt;
    endAtMap[id] = endAt;
    acumuladoMs += duracionEnSegundos * 1000;

    return {
      ...obraBase,
      precioBase: precio,
      incrementoMinimo: incremento,
      duracion: duracionEnSegundos,
      startAt,
      endAt,
    };
  });

  return {
    estado: 'configurado',
    creadoEn: t0,
    orden,
    precioBase: precioBaseConfig,
    incrementoMinimo: incrementoConfig,
    duracion: duracionConfig,
    startAt: startAtMap,
    endAt: endAtMap,
    obras: obrasConfiguradas,
  };
};

const ordenarObras = (config) => {
  if (!config?.obras) return [];
  const mapa = new Map(config.obras.map((obra) => [obra.id, obra]));
  const usados = new Set();
  const enOrden = (config.orden || [])
    .map((id) => {
      const obra = mapa.get(id);
      if (obra) usados.add(id);
      return obra || null;
    })
    .filter(Boolean);
  const restantes = config.obras.filter((obra) => !usados.has(obra.id));
  return [...enOrden, ...restantes];
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/obras', (req, res) => {
  try {
    const obras = cargarObras();
    res.json(obras);
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar las obras' });
  }
});

app.post('/api/config', (req, res) => {
  try {
    configuracion = construirConfiguracion(req.body || {});
    res.json({ ok: true, configuracion });

    axios.post(`${POSTORES_URL}/api/config`, configuracion, { timeout: 2000 }).catch(() => {});
  } catch (error) {
    const mensaje = error?.message || 'No se pudo guardar la configuración';
    const status = mensaje.includes('precio') || mensaje.includes('incremento') || mensaje.includes('duración')
      ? 400
      : 500;
    res.status(status).json({ error: mensaje });
  }
});

app.get('/api/config', (req, res) => {
  if (!configuracion) {
    return res.json({ estado: 'no-configurado' });
  }
  res.json(configuracion);
});

app.post('/api/reset', (req, res) => {
  configuracion = null;
  axios.post(`${POSTORES_URL}/api/reset`, {}, { timeout: 1500 }).catch(() => {});
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'manejador listo', configured: Boolean(configuracion) });
});

app.get('/api/status', (req, res) => {
  res.json({ configured: Boolean(configuracion) });
});

app.post('/api/configure', (req, res) => {
  res.status(configuracion ? 200 : 400).json({ configured: Boolean(configuracion) });
});

app.get('/api/auctions/order', (req, res) => {
  if (configuracion?.orden) {
    return res.json(configuracion.orden);
  }
  try {
    const obras = cargarObras();
    res.json(obras.map((obra) => obra.id));
  } catch (error) {
    res.status(500).json({ error: 'No se pudo leer el orden de obras' });
  }
});

app.post('/api/auctions/order', (req, res) => {
  res.status(400).json({ error: 'Utilice /api/config para definir el orden y reglas.' });
});

app.get('/api/auctions', (req, res) => {
  if (!configuracion) {
    try {
      const obras = cargarObras();
      return res.json({ estado: 'no-configurado', obras });
    } catch (error) {
      return res.status(500).json({ error: 'No se pudieron cargar las obras' });
    }
  }
  res.json({ ...configuracion, obras: ordenarObras(configuracion) });
});

app.get('/api/auctions/:id', (req, res) => {
  const obras = configuracion ? configuracion.obras : cargarObras();
  const obra = obras.find((item) => item.id === req.params.id);
  if (!obra) {
    return res.status(404).json({ error: 'Subasta no encontrada' });
  }
  res.json(obra);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`Manejador escuchando en http://${HOST}:${PORT}`);
});
