const origin = typeof window !== 'undefined' ? window.location.origin : '';
export const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:8081' : origin);
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:8081' : origin);

export const currency = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const ordenarObras = (configuracion) => {
  if (!configuracion?.obras) return [];
  if (Array.isArray(configuracion.orden) && configuracion.orden.length) {
    const porId = new Map(configuracion.obras.map((obra) => [obra.id, obra]));
    const usados = new Set();
    const ordenadas = configuracion.orden
      .map((id) => {
        const obra = porId.get(id);
        if (!obra) return null;
        usados.add(id);
        return obra;
      })
      .filter(Boolean);
    const restantes = configuracion.obras.filter((obra) => !usados.has(obra.id));
    return [...ordenadas, ...restantes];
  }
  return configuracion.obras;
};
