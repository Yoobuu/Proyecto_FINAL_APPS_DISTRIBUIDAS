import { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8080' : '';

const normalizarObra = (obra) => ({
  ...obra,
  precioBase: obra.precioBase ?? '',
  incrementoMinimo: obra.incrementoMinimo ?? '',
  duracion: obra.duracion ?? '',
});

function App() {
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [localError, setLocalError] = useState('');

  const cargarObras = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const obrasResponse = await fetch(`${API_BASE}/api/obras`);
      if (!obrasResponse.ok) {
        throw new Error('No se pudieron cargar las obras');
      }
      const obrasData = await obrasResponse.json();
      let dataParaUI = Array.isArray(obrasData) ? obrasData : [];
      dataParaUI = dataParaUI.map((obra) => ({ ...obra, precioBaseReal: obra.precioBase }));
      const basePorId = new Map(dataParaUI.map((obra) => [obra.id, obra]));

      const configResponse = await fetch(`${API_BASE}/api/config`).catch(() => null);
      if (configResponse?.ok) {
        const configData = await configResponse.json();
        if (configData && configData.estado !== 'no-configurado') {
          if (Array.isArray(configData.obras) && configData.obras.length) {
            dataParaUI = configData.obras.map((obra) => {
              const base = basePorId.get(obra.id);
              return {
                ...obra,
                precioBaseReal: base?.precioBaseReal ?? base?.precioBase ?? obra.precioBase,
              };
            });
          } else {
            const mapObras = new Map(dataParaUI.map((obra) => [obra.id, obra]));
            const ordenIds = Array.isArray(configData.orden) && configData.orden.length
              ? configData.orden
              : dataParaUI.map((obra) => obra.id);
            const usados = new Set();
            const ordenadas = ordenIds
              .map((id) => {
                const base = mapObras.get(id);
                if (!base) return null;
                usados.add(id);
                return {
                  ...base,
                  precioBase: configData.precioBase?.[id] ?? base.precioBase,
                  incrementoMinimo: configData.incrementoMinimo?.[id] ?? base.incrementoMinimo,
                  duracion: configData.duracion?.[id] ?? base.duracion,
                  precioBaseReal: base.precioBaseReal ?? base.precioBase,
                };
              })
              .filter(Boolean);
            const restantes = dataParaUI.filter((obra) => !usados.has(obra.id));
            dataParaUI = [...ordenadas, ...restantes];
          }
        }
      }

      setObras(dataParaUI.map(normalizarObra));
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar las obras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarObras();
  }, []);

  const moverObra = (index, offset) => {
    setObras((prev) => {
      const destino = index + offset;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[index], copia[destino]] = [copia[destino], copia[index]];
      return copia;
    });
  };

  const actualizarCampo = (id, campo, valor) => {
    setObras((prev) => prev.map((obra) => (obra.id === id ? { ...obra, [campo]: valor } : obra)));
  };

  const guardarConfiguracion = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    setLocalError('');

    for (const obra of obras) {
      const baseReal = obra.precioBaseReal ?? obra.precioBase ?? 0;
      const precioInicial = Number(obra.precioBase);
      const incremento = Number(obra.incrementoMinimo);
      const duracion = Number(obra.duracion);
      if (!Number.isFinite(precioInicial) || precioInicial < Number(baseReal)) {
        setSaving(false);
        setLocalError(`Precio inicial de "${obra.titulo}" no puede ser menor al precio base (${baseReal}).`);
        return;
      }
      if (!Number.isFinite(incremento) || incremento <= 0) {
        setSaving(false);
        setLocalError(`El incremento mínimo de "${obra.titulo}" debe ser mayor a 0.`);
        return;
      }
      if (!Number.isFinite(duracion) || duracion < 1) {
        setSaving(false);
        setLocalError(`La duración de "${obra.titulo}" debe ser al menos 1 segundo.`);
        return;
      }
    }

    const orden = obras.map((obra) => obra.id);
    const precioBase = {};
    const incrementoMinimo = {};
    const duracion = {};

    obras.forEach((obra) => {
      precioBase[obra.id] = Number(obra.precioBase);
      incrementoMinimo[obra.id] = Number(obra.incrementoMinimo);
      duracion[obra.id] = Number(obra.duracion);
    });

    try {
      const response = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden, precioBase, incrementoMinimo, duracion }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar');
      }
      const result = await response.json();
      if (result?.configuracion?.obras) {
        setObras(result.configuracion.obras.map(normalizarObra));
      }
      setMessage('Configuración guardada correctamente.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const resetearConfiguracion = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    setLocalError('');
    try {
      const response = await fetch(`${API_BASE}/api/reset`, { method: 'POST' });
      if (!response.ok) {
        throw new Error('No se pudo resetear la configuración');
      }
      setMessage('Configuración reseteada.');
      await cargarObras();
    } catch (err) {
      setError(err.message || 'No se pudo resetear.');
    } finally {
      setSaving(false);
    }
  };

  const cardList = useMemo(() => obras, [obras]);

  return (
    <main className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Manejador · Fase 2</p>
          <h1>Configura el orden y reglas de cada subasta</h1>
          <p className="subhead">
            Ordena las obras, ajusta el precio inicial, el incremento mínimo y la duración en segundos.
          </p>
          <p className="subhead">
            <strong>Paso 1:</strong> Ajusta los valores por obra. <strong>Paso 2:</strong> Guarda la configuración para
            enviar el orden y las reglas al servicio de postores (8081). <strong>Paso 3:</strong> Desde postores se
            usarán estos datos para registros, countdown y pujas.
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={resetearConfiguracion} disabled={saving || loading}>
            Resetear configuración
          </button>
          <button className="primary" onClick={guardarConfiguracion} disabled={saving || loading || !obras.length}>
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </header>

      {!loading && cardList.length > 0 && (
        <div className="status status--info">
          <strong>Resumen:</strong> Se configurarán {cardList.length} subastas en el orden mostrado (#1, #2, ...). Al
          guardar, esta configuración se enviará automáticamente al servicio de postores (8081).
        </div>
      )}

      {message && <div className="status status--ok">{message}</div>}
      {(error || localError) && <div className="status status--error">Error: {error || localError}</div>}
      {loading && <div className="status">Cargando obras...</div>}

      {!loading && !obras.length && <div className="status">No hay obras disponibles.</div>}

      {!loading && cardList.length > 0 && (
        <section className="grid">
          {cardList.map((obra, index) => (
            <article key={obra.id} className="card">
              {obra.imagen && <img className="card__image" src={obra.imagen} alt={obra.titulo} />}
              <div className="card__body">
                <div className="card__title">
                  <div>
                    <p className="eyebrow">{obra.artista}</p>
                    <h2>{obra.titulo}</h2>
                    <p className="muted">Año {obra.anio}</p>
                  </div>
                  <div className="order">
                    <span className="order__index">#{index + 1}</span>
                    <button onClick={() => moverObra(index, -1)} disabled={index === 0}>
                      ↑
                    </button>
                    <button onClick={() => moverObra(index, 1)} disabled={index === cardList.length - 1}>
                      ↓
                    </button>
                  </div>
                </div>

                <div className="fields">
                  <label className="field">
                    <span>Precio inicial</span>
                    <p className="text-muted">Debe ser mayor o igual al precio base sugerido de la obra.</p>
                    <input
                      type="number"
                      min="0"
                      value={obra.precioBase}
                      onChange={(e) => actualizarCampo(obra.id, 'precioBase', e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Incremento mínimo</span>
                    <p className="text-muted">Valor mínimo que debe aumentar cada puja (debe ser &gt; 0).</p>
                    <input
                      type="number"
                      min="0"
                      value={obra.incrementoMinimo}
                      onChange={(e) => actualizarCampo(obra.id, 'incrementoMinimo', e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Duración (segundos)</span>
                    <p className="text-muted">Duración de la subasta en segundos (debe ser al menos 1 segundo).</p>
                    <input
                      type="number"
                      min="1"
                      value={obra.duracion}
                      onChange={(e) => actualizarCampo(obra.id, 'duracion', e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
      <footer className="app-footer">
        Proyecto Subastas Remotas — Fall 2025 · Node.js · React · Socket.io · Docker
      </footer>
    </main>
  );
}

export default App;
