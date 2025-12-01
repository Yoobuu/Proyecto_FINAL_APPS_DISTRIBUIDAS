import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE, currency, ordenarObras } from './shared';

function Subasta({ config, loading, socket }) {
  const { id } = useParams();
  const [auction, setAuction] = useState(null);
  const [auctionState, setAuctionState] = useState('PENDING');
  const [bids, setBids] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [segundosInicio, setSegundosInicio] = useState(null);
  const [segundosFin, setSegundosFin] = useState(null);
  const [winner, setWinner] = useState(null);
  const [bannerError, setBannerError] = useState('');
  const lastBidUserRef = useRef('');

  const [formRegistro, setFormRegistro] = useState({ nombre: '' });
  const [mensajeRegistro, setMensajeRegistro] = useState('');
  const [errorRegistro, setErrorRegistro] = useState('');

  const [formBid, setFormBid] = useState({ monto: '' });
  const [mensajeBid, setMensajeBid] = useState('');
  const [errorBid, setErrorBid] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('subastas.username');
    if (saved && !formRegistro.nombre) {
      setFormRegistro((prev) => ({ ...prev, nombre: saved }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const obra = useMemo(() => {
    if (!config?.obras) return null;
    return ordenarObras(config).find((item) => item.id === id) || null;
  }, [config, id]);

  const startAtBase = useMemo(() => {
    if (obra?.startAt) return obra.startAt;
    if (config?.startAt && config.startAt[id]) return config.startAt[id];
    return null;
  }, [obra, config, id]);

  const posicionEnSecuencia = useMemo(() => {
    if (!config?.obras) return null;
    const lista = ordenarObras(config);
    const index = lista.findIndex((item) => item.id === id);
    if (index === -1) return null;
    return { index: index + 1, total: lista.length };
  }, [config, id]);

  const maxBidAmount = useMemo(
    () => (Array.isArray(bids) && bids.length ? Math.max(...bids.map((bid) => Number(bid.amount) || 0)) : null),
    [bids],
  );

  useEffect(() => {
    if (!obra) return;
    const startAt = startAtBase;
    const endAt = obra.endAt || (startAt ? startAt + (obra.duracion || 0) * 1000 : null);
    const state = obra.state || 'PENDING';
    const currentPrice = obra.currentPrice ?? obra.precioBase ?? 0;
    const minIncrement = obra.minIncrement ?? obra.incrementoMinimo ?? 0;
    setAuction({ ...obra, startAt, endAt, currentPrice, minIncrement, state });
    setAuctionState(state);
    setBids((prev) => {
      if (Array.isArray(prev) && prev.length > 0) {
        return prev;
      }
      return Array.isArray(obra.bids) ? obra.bids : [];
    });
    setWinner(obra.winner || null);
    if (startAt) {
      setSegundosInicio(Math.max(0, Math.floor((startAt - Date.now()) / 1000)));
    }
    if (endAt) {
      setSegundosFin(Math.max(0, Math.floor((endAt - Date.now()) / 1000)));
    }
  }, [obra, startAtBase]);

  useEffect(() => {
    const cargarRegistros = async () => {
      if (!config || config.estado === 'no-configurado') return;
      try {
        const response = await fetch(`${API_BASE}/api/auctions/${id}/registers`);
        const data = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(data.registros)) {
          setRegistros(data.registros);
        }
      } catch (err) {
        console.error(err);
      }
    };
    cargarRegistros();
  }, [config, id]);

  useEffect(() => {
    if (!socket) return;

    const onCountdown = (payload) => {
      if (!payload || payload.id !== id) return;
      if (typeof payload.segundosRestantes === 'number') {
        setSegundosInicio(payload.segundosRestantes);
      }
      if (typeof payload.segundosParaFinalizar === 'number') {
        setSegundosFin(payload.segundosParaFinalizar);
      }
      setAuction((prev) =>
        prev
          ? {
              ...prev,
              startAt: payload.startAt ?? prev.startAt,
              endAt: payload.endAt ?? prev.endAt,
              state: payload.state || prev.state,
            }
          : prev,
      );
      if (payload.state) setAuctionState(payload.state);
    };

    const onRegistro = (payload) => {
      if (payload && payload.auctionId === id && Array.isArray(payload.registros)) {
        setRegistros(payload.registros);
      }
    };

    const onBidAccepted = (payload) => {
      if (!payload || payload.id !== id) return;
      if (payload.user && payload.user === lastBidUserRef.current) {
        setErrorBid('');
        setMensajeBid('Puja aceptada');
      }
      setAuction((prev) =>
        prev
          ? {
              ...prev,
              currentPrice: payload.currentPrice ?? payload.amount ?? prev.currentPrice,
              state: 'ACTIVE',
            }
          : prev,
      );
      setBids((prev) => [...prev, { user: payload.user, amount: payload.amount, time: payload.time }]);
    };

    const onBidRejected = (payload) => {
      if (!payload || payload.id !== id) return;
      setMensajeBid('');
      setErrorBid(payload.reason || 'Puja rechazada');
    };

    const onAuctionUpdate = (payload) => {
      if (!payload || payload.id !== id) return;
      setAuction((prev) => (prev ? { ...prev, currentPrice: payload.currentPrice ?? prev.currentPrice } : prev));
    };

    const onAuctionOpened = (payload) => {
      if (!payload || payload.id !== id) return;
      setAuctionState('ACTIVE');
      setAuction((prev) => (prev ? { ...prev, state: 'ACTIVE' } : prev));
    };

    const onAuctionClosed = (payload) => {
      if (!payload || payload.id !== id) return;
      setAuctionState('CLOSED');
      setWinner(payload.winner || null);
      setAuction((prev) => (prev ? { ...prev, state: 'CLOSED', winner: payload.winner || null } : prev));
    };

    socket.on('countdown', onCountdown);
    socket.on('nuevo-registro', onRegistro);
    socket.on('bid:placed', onBidAccepted);
    socket.on('bid:rejected', onBidRejected);
    socket.on('auction:updated', onAuctionUpdate);
    socket.on('auction:opened', onAuctionOpened);
    socket.on('auction:closed', onAuctionClosed);

    return () => {
      socket.off('countdown', onCountdown);
      socket.off('nuevo-registro', onRegistro);
      socket.off('bid:placed', onBidAccepted);
      socket.off('bid:rejected', onBidRejected);
      socket.off('auction:updated', onAuctionUpdate);
      socket.off('auction:opened', onAuctionOpened);
      socket.off('auction:closed', onAuctionClosed);
    };
  }, [socket, id]);

  useEffect(() => {
    if (!bannerError) return;
    const t = setTimeout(() => setBannerError(''), 3000);
    return () => clearTimeout(t);
  }, [bannerError]);

  if (loading) {
    return <div className="status">Cargando subasta...</div>;
  }

  if (!config || config.estado === 'no-configurado') {
    return (
      <div className="status status--info pill pill--badge badge-wait">
        Esperando configuración
      </div>
    );
  }

  if (!auction) {
    return <div className="status status--error">Subasta no encontrada.</div>;
  }

  const handleRegistro = async (event) => {
    event.preventDefault();
    setMensajeRegistro('');
    setErrorRegistro('');
    if (auctionState === 'CLOSED') {
      setErrorRegistro('La subasta está cerrada.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/auctions/${id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: formRegistro.nombre }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar');
      setRegistros(Array.isArray(data.registros) ? data.registros : []);
      setMensajeRegistro('Registro enviado.');
      if (formRegistro.nombre && formRegistro.nombre.trim()) {
        const trimmed = formRegistro.nombre.trim();
        setUsername(trimmed);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('subastas.username', trimmed);
        }
      }
    } catch (err) {
      setErrorRegistro(err.message || 'No se pudo registrar.');
      setBannerError(err.message || 'No se pudo registrar.');
    }
  };

  const handleBid = async (event) => {
    event.preventDefault();
    setMensajeBid('');
    setErrorBid('');
    if (auctionState !== 'ACTIVE') {
      setErrorBid('La subasta no está activa.');
      return;
    }
    if (!username || !username.trim()) {
      setErrorBid('Debes registrarte con tu nombre antes de pujar.');
      return;
    }
    const monto = Number(formBid.monto);
    const minimo = (auction.currentPrice || 0) + (auction.minIncrement || 0);
    if (!Number.isFinite(monto) || monto < minimo) {
      setErrorBid(`La puja debe ser al menos ${currency.format(minimo)}.`);
      return;
    }
    lastBidUserRef.current = username.trim();
    try {
      const response = await fetch(`${API_BASE}/api/auctions/${id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: username, monto }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar la puja');
      const nuevaSubasta = data.subasta || null;
      if (nuevaSubasta) {
        setAuction((prev) => ({ ...(prev || {}), ...nuevaSubasta }));
        setBids(Array.isArray(nuevaSubasta.bids) ? nuevaSubasta.bids : []);
        setAuctionState(nuevaSubasta.state || auctionState);
      }
      setMensajeBid('Puja enviada.');
      setFormBid((prev) => ({ ...prev, monto: '' }));
    } catch (err) {
      setErrorBid(err.message || 'No se pudo enviar la puja.');
      setBannerError(err.message || 'No se pudo enviar la puja.');
    }
  };

  const estadoTexto = {
    PENDING: 'Esperando inicio',
    ACTIVE: 'Subasta activa',
    CLOSED: 'Subasta cerrada',
  };

  const countdownInicio =
    typeof segundosInicio === 'number' ? `Comienza en ${segundosInicio}s` : 'Esperando inicio';
  const countdownFin = typeof segundosFin === 'number' ? `Termina en ${segundosFin}s` : 'Esperando inicio';

  const ganadorTexto =
    auctionState === 'CLOSED'
      ? winner
        ? `Ganador: ${winner.user} con ${currency.format(winner.amount)}`
        : 'No hubo pujas.'
      : null;

  const badgeColor = {
    PENDING: 'badge-wait',
    ACTIVE: 'badge-active',
    CLOSED: 'badge-closed',
  };

  return (
    <section className="detail">
      {bannerError && <div className="status status--error">{bannerError}</div>}
      <Link className="link" to="/">
        ← Volver a la lista
      </Link>
      <div className="detail__content">
        {auction.imagen && <img className="detail__image" src={auction.imagen} alt={auction.titulo} />}
        <div className="detail__body">
          <p className="eyebrow">{auction.artista}</p>
          <h2>{auction.titulo}</h2>
          <p className="muted">Año {auction.anio}</p>
          {posicionEnSecuencia && (
            <p className="text-muted">
              Subasta {posicionEnSecuencia.index} de {posicionEnSecuencia.total} en la secuencia configurada por el
              manejador.
            </p>
          )}
          <p className="muted">
            Esta vista corresponde al <strong>detalle de una subasta remota</strong>: aquí se refleja en tiempo real el
            estado, el countdown y todas las pujas que llegan vía WebSocket.
          </p>
          <div className="pill-row">
            <span className="pill">Precio base {currency.format(auction.precioBase ?? 0)}</span>
            <span className="pill">Actual {currency.format(auction.currentPrice ?? auction.precioBase ?? 0)}</span>
            <span className="pill">Incremento mínimo {currency.format(auction.minIncrement ?? 0)}</span>
            <span className="pill">Duración {auction.duracion ?? 0} s</span>
            <span className={`pill pill--badge ${badgeColor[auctionState] || ''}`}>
              {estadoTexto[auctionState] || auctionState}
            </span>
          </div>
          <div className="pill-row">
            <span className="pill">
              Inicio: <strong>{countdownInicio}</strong>
            </span>
            {auctionState !== 'PENDING' && (
              <span className="pill">
                Cierre: <strong>{countdownFin}</strong>
              </span>
            )}
          </div>

          {ganadorTexto && (
            <div className="status status--info">
              <strong>Resultado de la subasta:</strong> {ganadorTexto}
            </div>
          )}

          <div className="form-box">
            <h3>Paso 1 · Registrarse</h3>
            <p className="muted">
              Ingresa solo tu nombre para quedar registrado como postor de esta obra. El registro se comparte con todos
              en tiempo real.
            </p>
            <form onSubmit={handleRegistro} className="form">
              <label className="field">
                <span>Nombre</span>
                <input
                  required
                  type="text"
                  value={formRegistro.nombre}
                  onChange={(e) => setFormRegistro((prev) => ({ ...prev, nombre: e.target.value }))}
                />
              </label>
              <button
                type="button"
                className="link-inline"
                onClick={() => {
                  if (typeof window === 'undefined') return;
                  const saved = window.localStorage.getItem('subastas.username');
                  if (saved) {
                    setFormRegistro((prev) => ({ ...prev, nombre: saved }));
                  }
                }}
              >
                Usar el último nombre utilizado en este navegador
              </button>
              <button className="primary" type="submit" disabled={auctionState === 'CLOSED'}>
                Registrarse
              </button>
            </form>
            {mensajeRegistro && <div className="status status--info">{mensajeRegistro}</div>}
            {errorRegistro && <div className="status status--error">{errorRegistro}</div>}
          </div>

          <div className="form-box">
            <h3>Paso 2 · Pujar cuando la subasta esté activa</h3>
            <p className="muted">
              Estado: {estadoTexto[auctionState]}. Mínimo siguiente: {currency.format(
                (auction.currentPrice || 0) + (auction.minIncrement || 0),
              )}
              {username && (
                <>
                  {' '}
                  | Registrado como: <strong>{username}</strong>
                </>
              )}
            </p>
            {auctionState === 'ACTIVE' ? (
              <form onSubmit={handleBid} className="form">
                <label className="field">
                  <span>Monto</span>
                  <input
                    required
                    type="number"
                    min={(auction.currentPrice || 0) + (auction.minIncrement || 0)}
                    placeholder="Monto en USD..."
                    value={formBid.monto}
                    onChange={(e) => setFormBid((prev) => ({ ...prev, monto: e.target.value }))}
                  />
                </label>
                <button className="primary" type="submit">
                  Pujar
                </button>
              </form>
            ) : auctionState === 'CLOSED' ? (
              <div className="status status--warn">La subasta está cerrada. No se permiten nuevas pujas.</div>
            ) : (
              <div className="status">El formulario se habilita cuando la subasta esté activa.</div>
            )}
            {mensajeBid && <div className="status status--info">{mensajeBid}</div>}
            {errorBid && <div className="status status--error">{errorBid}</div>}
          </div>

          <div className="form-box" style={{ marginTop: '12px' }}>
            <h4>
              Registros recientes ({registros.length})
            </h4>
              {registros.length === 0 ? (
                <p className="muted">Aún no hay registros.</p>
              ) : (
                <ul style={{ paddingLeft: '18px' }}>
                  {registros.map((registro, idx) => (
                    <li key={`${registro.nombre}-${idx}`}>
                      <strong>{registro.nombre}</strong>
                    </li>
                  ))}
                </ul>
              )}
          </div>

          <div className="form-box" style={{ marginTop: '12px' }}>
            <h4>Historial de pujas</h4>
            {bids.length === 0 ? (
              <p className="muted">Aún no hay pujas.</p>
            ) : (
              <ul style={{ paddingLeft: '18px' }}>
                {bids
                  .slice()
                  .reverse()
                  .map((bid, idx) => (
                    <li
                      key={`${bid.user}-${bid.amount}-${idx}`}
                      className={`bid-row ${maxBidAmount != null && bid.amount === maxBidAmount ? 'bid-row--top' : ''}`}
                    >
                      <span className="bid-row__user">
                        <strong>{bid.user}</strong>
                      </span>
                      <span className="bid-row__amount">
                        {currency.format(bid.amount)}
                        {maxBidAmount != null && bid.amount === maxBidAmount && (
                          <span className="bid-row__badge">Mayor puja</span>
                        )}
                      </span>
                      <span className="bid-row__time">
                        {new Date(bid.time || Date.now()).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Subasta;
