import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE, SOCKET_URL, currency } from './shared';
import { Link } from 'react-router-dom';

function HistorialGlobal() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedObra, setSelectedObra] = useState('todas');

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/api/history-global`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'No se pudo cargar el historial');
        }
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        setError(err.message || 'No se pudo cargar el historial');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    const onBidPlaced = (payload) => {
      if (!payload?.id || !payload?.user || payload.amount == null) return;
      setItems((prev) => [
        ...prev,
        {
          id: payload.id,
          obra: payload.obra || payload.id,
          usuario: payload.user,
          monto: payload.amount,
          timestamp: payload.time || Date.now(),
        },
      ]);
    };
    socket.on('bid:placed', onBidPlaced);
    return () => {
      socket.off('bid:placed', onBidPlaced);
      socket.close();
    };
  }, []);

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Historial global</p>
          <h1>Pujas recientes</h1>
          <p className="subhead">
            Listado en vivo de las pujas recibidas en todas las subastas. Esta pantalla corresponde al{' '}
            <strong>historial global</strong> del proyecto final: aquí se puede verificar el orden y el detalle de
            cada puja realizada por los postores.
          </p>
          <h2>Historial Global de Pujas (Tiempo Real)</h2>
          <p className="text-muted">
            Aquí puedes ver todas las pujas realizadas en todas las subastas, en orden descendente.
          </p>
        </div>
        <Link className="primary ghost" to="/">
          ← Volver
        </Link>
      </header>

      {error && <div className="status status--error">{error}</div>}
      {loading && <div className="status">Cargando historial...</div>}

      {!loading && !error && (
        <div className="table">
          <div className="table__head">
            <span>Obra</span>
            <span>Usuario</span>
            <span>Monto</span>
            <span>Fecha/Hora</span>
          </div>
          <div className="status">
            <strong>Resumen:</strong> Total de pujas registradas: {items.length}
          </div>
          <div className="status">
            <strong>Pujas por obra:</strong>{' '}
            {items.length === 0
              ? '—'
              : Array.from(
                  new Map(
                    items.map((item) => [item.obra || item.id, item.obra || item.id]),
                  ).values(),
                )
                  .map((obra) => {
                    const count = items.filter((item) => (item.obra || item.id) === obra).length;
                    return `${obra} (${count})`;
                  })
                  .join(' · ')}
          </div>
          <div className="status">
            <label className="field">
              <span>Filtrar por obra</span>
              <select
                value={selectedObra}
                onChange={(e) => setSelectedObra(e.target.value)}
              >
                <option value="todas">Todas las obras</option>
                {Array.from(
                  new Map(
                    items.map((item) => [item.obra || item.id, item.obra || item.id]),
                  ).values(),
                ).map((obra) => (
                  <option key={obra} value={obra}>
                    {obra}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {items.length === 0 ? (
            <div className="status">No hay pujas registradas.</div>
          ) : (
            items
              .slice()
              .reverse()
              .filter((item) => selectedObra === 'todas' || (item.obra || item.id) === selectedObra)
              .map((item, idx) => (
                <div className="table__row" key={`${item.id}-${idx}`}>
                  <span>{item.obra || item.id}</span>
                  <span>{item.usuario}</span>
                  <span>{currency.format(item.monto ?? 0)}</span>
                  <span>{new Date(item.timestamp || Date.now()).toLocaleString()}</span>
                </div>
              ))
          )}
        </div>
      )}
    </section>
  );
}

export default HistorialGlobal;
