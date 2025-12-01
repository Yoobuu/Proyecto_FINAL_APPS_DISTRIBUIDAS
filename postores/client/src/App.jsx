import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { io } from 'socket.io-client';
import Subasta from './Subasta';
import HistorialGlobal from './HistorialGlobal';
import { API_BASE, SOCKET_URL, currency, ordenarObras } from './shared';

function App() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [countdowns, setCountdowns] = useState({});
  const [eventLog, setEventLog] = useState([]);
  const socket = useMemo(() => io(SOCKET_URL), []);
  const configRequestRef = useRef(false);
  const hasObras = Boolean(config?.obras?.length);
  const hasObrasRef = useRef(false);

  const appendEvent = useCallback((type, payload) => {
    setEventLog((prev) => {
      const entry = { ts: Date.now(), type, payload };
      const next = [...prev, entry];
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });
  }, []);

  const cargarConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/auctions`);
      if (!response.ok) {
        throw new Error('No se pudo obtener la configuración');
      }
      const data = await response.json();
      if (data?.estado === 'no-configurado') {
        setConfig({ estado: 'no-configurado', obras: [] });
        return;
      }
      setConfig(data);
    } catch (err) {
      console.error(err);
      setError('No se pudo obtener la configuración de subastas.');
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarConfig();
  }, [cargarConfig]);

  useEffect(() => {
    hasObrasRef.current = hasObras;
  }, [hasObras]);

  useEffect(() => {
    const requestConfigIfEmpty = () => {
      if (hasObrasRef.current || configRequestRef.current) return;
      configRequestRef.current = true;
      cargarConfig().finally(() => {
        configRequestRef.current = false;
      });
    };

    const onCountdown = (payload) => {
      requestConfigIfEmpty();
      if (!payload || !payload.id) return;
      setCountdowns((prev) => ({ ...prev, [payload.id]: payload }));
      if (payload.state) {
        setConfig((prev) => {
          if (!prev?.obras) return prev;
          return {
            ...prev,
            obras: prev.obras.map((obra) =>
              obra.id === payload.id
                ? {
                    ...obra,
                    state: payload.state,
                    startAt: payload.startAt ?? obra.startAt,
                    endAt: payload.endAt ?? obra.endAt,
                  }
                : obra,
            ),
          };
        });
      }
    };
    const onOpened = (payload) => {
      requestConfigIfEmpty();
      if (!payload?.id) return;
       appendEvent('auction:opened', payload);
      setConfig((prev) => {
        if (!prev?.obras) return prev;
        return { ...prev, obras: prev.obras.map((obra) => (obra.id === payload.id ? { ...obra, state: 'ACTIVE' } : obra)) };
      });
    };
    const onClosed = (payload) => {
      requestConfigIfEmpty();
      if (!payload?.id) return;
       appendEvent('auction:closed', payload);
      setConfig((prev) => {
        if (!prev?.obras) return prev;
        return {
          ...prev,
          obras: prev.obras.map((obra) =>
            obra.id === payload.id
              ? { ...obra, state: 'CLOSED', winner: payload.winner || null, currentPrice: payload.currentPrice ?? obra.currentPrice }
              : obra,
          ),
        };
      });
    };
    const onUpdated = (payload) => {
      requestConfigIfEmpty();
      if (!payload?.id) return;
       appendEvent('auction:updated', payload);
      setConfig((prev) => {
        if (!prev?.obras) return prev;
        return {
          ...prev,
          obras: prev.obras.map((obra) =>
            obra.id === payload.id
              ? {
                  ...obra,
                  currentPrice: payload.currentPrice ?? obra.currentPrice,
                  state: payload.state ?? obra.state,
                  startAt: payload.startAt ?? obra.startAt,
                  endAt: payload.endAt ?? obra.endAt,
                  winner: payload.winner ?? obra.winner,
                }
              : obra,
          ),
        };
      });
    };

    const onConfigReset = () => {
      hasObrasRef.current = false;
      setConfig({ estado: 'no-configurado', obras: [] });
      setCountdowns({});
      setLoading(false);
      setError('');
      appendEvent('config:reset');
    };

    const onConfigUpdated = (payload) => {
      if (!payload) return;
      hasObrasRef.current = Boolean(payload?.obras?.length);
      setConfig(payload);
      setCountdowns({});
      setLoading(false);
      setError('');
      appendEvent('config:updated', payload);
    };

    socket.on('countdown', onCountdown);
    socket.on('auction:opened', onOpened);
    socket.on('auction:closed', onClosed);
    socket.on('auction:updated', onUpdated);
    socket.on('config:reset', onConfigReset);
    socket.on('config:updated', onConfigUpdated);
    return () => {
      socket.off('countdown', onCountdown);
      socket.off('auction:opened', onOpened);
      socket.off('auction:closed', onClosed);
      socket.off('auction:updated', onUpdated);
      socket.off('config:reset', onConfigReset);
      socket.off('config:updated', onConfigUpdated);
      socket.close();
    };
  }, [socket, cargarConfig, appendEvent]);

  return (
    <main className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Postores · Fase 3</p>
          <h1>Explora las subastas configuradas</h1>
          <p className="subhead">
            <strong>Paso 2:</strong> El manejador ya definió orden, precios, incrementos y duración. Aquí los postores
            se registran y observan en tiempo real el estado de cada subasta.
          </p>
          <p className="subhead">
            Haz clic en <strong>&quot;Ver detalle&quot;</strong> para ir a la página de una subasta, registrarte con tu
            nombre y, cuando esté activa, realizar pujas.
          </p>
          <p className="text-muted">
            Aquí puedes ver todas las subastas configuradas por el manejador. Ingresa a cualquiera para registrarte y
            participar en tiempo real.
          </p>
        </div>
        <Link className="primary ghost" to="/">
          Inicio
        </Link>
        <Link className="primary ghost" to="/historial">
          Historial
        </Link>
      </header>

      {error && <div className="status status--error">{error}</div>}

      <Routes>
        <Route path="/" element={<HomePage config={config} loading={loading} countdowns={countdowns} />} />
        <Route path="/subasta/:id" element={<Subasta config={config} loading={loading} socket={socket} />} />
        <Route path="/historial" element={<HistorialGlobal />} />
      </Routes>
      {!!eventLog.length && (
        <section className="event-log">
          <h2 className="event-log__title">Eventos en tiempo real (demo)</h2>
          <p className="text-muted">Últimos eventos recibidos vía WebSocket en este navegador.</p>
          <div className="event-log__list">
            {eventLog
              .slice()
              .reverse()
              .map((entry, idx) => (
                <div key={`${entry.ts}-${idx}`} className="event-log__entry">
                  <span className="event-log__entry-type">{entry.type}</span>
                  <span className="event-log__entry-id">
                    {entry.payload?.id || entry.payload?.obra || '—'}
                  </span>
                  <span className="event-log__entry-time">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
      <footer className="app-footer">
        Proyecto Subastas Remotas — Fall 2025 · Node.js · React · Socket.io · Docker
      </footer>
    </main>
  );
}

function HomePage({ config, loading, countdowns }) {
  if (loading) {
    return <div className="status">Cargando subastas...</div>;
  }

  if (!config || config.estado === 'no-configurado') {
    return (
      <div className="status status--info">
        Esperando configuración del manejador. Abre primero <strong>http://localhost:8080</strong>, ajusta el orden,
        precio inicial, incremento mínimo y duración, y luego guarda para que las subastas aparezcan aquí.
      </div>
    );
  }

  const obrasOrdenadas = useMemo(() => ordenarObras(config), [config]);
  const total = obrasOrdenadas.length;
  const activas = obrasOrdenadas.filter((obra) => obra.state === 'ACTIVE').length;
  const cerradas = obrasOrdenadas.filter((obra) => obra.state === 'CLOSED').length;

  return (
    <>
      <div className="status status--info">
        {obrasOrdenadas.length} obras disponibles. Revisa los detalles, verifica el estado
        &nbsp;(<strong>Esperando inicio</strong>, <strong>Subasta activa</strong> o <strong>Subasta cerrada</strong>) y
        luego entra al detalle de la obra para registrarte y pujar.
      </div>
      <div className="status">
        <strong>Resumen rápido:</strong> Subastas configuradas: {total} · Activas: {activas} · Cerradas: {cerradas}
      </div>
      <div className="status">
        <strong>Cómo leer esta pantalla:</strong> Cada tarjeta corresponde a una subasta remota. El color del badge
        indica el estado actual y los chips de “Comienza en / Termina en” muestran los countdowns calculados con los
        tiempos enviados por el manejador y actualizados en tiempo real vía WebSocket.
      </div>
      <section className="grid">
        {obrasOrdenadas.map((obra) => (
          <article key={obra.id} className="card">
            {obra.imagen && <img className="card__image" src={obra.imagen} alt={obra.titulo} />}
            <div className="card__body">
              <p className="eyebrow">{obra.artista}</p>
              <h2>{obra.titulo}</h2>
              <p className="muted">Año {obra.anio}</p>
              <div className="pill-row">
                <span className={`pill pill--badge ${obra.state === 'ACTIVE' ? 'badge-active' : obra.state === 'CLOSED' ? 'badge-closed' : 'badge-wait'}`}>
                  {obra.state === 'ACTIVE' ? 'Subasta activa' : obra.state === 'CLOSED' ? 'Subasta cerrada' : 'Esperando inicio'}
                </span>
              </div>
              <div className="pill-row">
                <span className="pill">Precio base {currency.format(obra.precioBase ?? 0)}</span>
                <span className="pill">Incremento mínimo {currency.format(obra.incrementoMinimo ?? 0)}</span>
                <span className="pill">Duración {obra.duracion ?? 0} s</span>
                {countdowns?.[obra.id] && (
                  <span className="pill pill--accent">
                    Comienza en {countdowns[obra.id].segundosRestantes ?? 0}s
                  </span>
                )}
                {countdowns?.[obra.id]?.segundosParaFinalizar != null && obra.state === 'ACTIVE' && (
                  <span className="pill pill--accent">
                    Termina en {countdowns[obra.id].segundosParaFinalizar ?? 0}s
                  </span>
                )}
              </div>
              <p className="text-muted">
                Inicio previsto:{' '}
                {obra.startAt ? new Date(obra.startAt).toLocaleTimeString() : '—'} · Cierre previsto:{' '}
                {obra.endAt ? new Date(obra.endAt).toLocaleTimeString() : '—'}
              </p>
              {obra.state === 'CLOSED' && obra.winner?.user && (
                <p className="text-muted">
                  Ganador: <strong>{obra.winner.user}</strong> con{' '}
                  {currency.format(obra.winner.amount ?? obra.currentPrice ?? 0)}
                </p>
              )}
              <Link className="link" to={`/subasta/${obra.id}`}>
                Ver detalle →
              </Link>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

export default App;
