const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function esFechaIso(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

export function etiquetaFecha(fecha: string): string {
  if (!esFechaIso(fecha)) return fecha;
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const prefijo = fecha === hoyIso() ? 'Hoy' : fecha === ayer ? 'Ayer' : '';
  const legible = formatoFecha.format(new Date(`${fecha}T12:00:00`));
  const capitalizado = legible.charAt(0).toUpperCase() + legible.slice(1);
  return prefijo ? `${prefijo} · ${capitalizado}` : capitalizado;
}

export function agruparPorFecha<T>(
  items: T[],
  obtenerFecha: (item: T) => string | undefined | null,
): { fecha: string; items: T[] }[] {
  const mapa = new Map<string, T[]>();
  for (const item of items) {
    const fecha = obtenerFecha(item) ?? '';
    const lista = mapa.get(fecha) ?? [];
    lista.push(item);
    mapa.set(fecha, lista);
  }
  return Array.from(mapa, ([fecha, items]) => ({ fecha, items }));
}
