const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function isoLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function leerFechaUtc(valor: string): Date {
  const iso = valor.replace(' ', 'T');
  // SQLite guarda UTC sin sufijo; JavaScript lo interpretaria como hora local.
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(iso) ? iso : `${iso}Z`);
}

/** Dia local de una marca UTC de SQLite o de la API, sin alterar el dato guardado. */
export function fechaLocalIso(valor: string | null | undefined): string {
  if (!valor) return '';
  if (esFechaIso(valor)) return valor;
  const fecha = leerFechaUtc(valor);
  return Number.isNaN(fecha.getTime()) ? '' : isoLocal(fecha);
}

/** Fecha y hora local para recibos, tanto en pantalla como impresos. */
export function fechaHoraLocal(valor: string | null | undefined): string {
  if (!valor) return '';
  const diaLocal = fechaLocalIso(valor);
  if (!diaLocal) return valor;
  const [a, m, d] = diaLocal.split('-');
  if (esFechaIso(valor)) return `${d}/${m}/${a}`;
  const fecha = leerFechaUtc(valor);
  const hora = String(fecha.getHours()).padStart(2, '0');
  const minuto = String(fecha.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${a} ${hora}:${minuto}`;
}

/** Limites UTC [inicio, fin) de un dia local para consultar marcas SQLite UTC. */
export function rangoDiaUtc(dia: string): [string, string] {
  const inicio = new Date(`${dia}T00:00:00`);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return [inicio, fin].map((fecha) =>
    fecha.toISOString().slice(0, 19).replace('T', ' '),
  ) as [string, string];
}

export function hoyIso(): string {
  return isoLocal(new Date());
}

export function esFechaIso(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

export function etiquetaFecha(fecha: string): string {
  if (!esFechaIso(fecha)) return fecha;
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const prefijo = fecha === isoLocal(hoy) ? 'Hoy' : fecha === isoLocal(ayer) ? 'Ayer' : '';
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
