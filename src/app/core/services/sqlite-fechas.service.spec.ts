import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteService } from './sqlite.service';

const DIA = '2026-10-16';
const RANGO = [new Date(2026, 9, 16), new Date(2026, 9, 17)].map((fecha) =>
  fecha.toISOString().slice(0, 19).replace('T', ' '),
);

describe('consultas por dia local', () => {
  let servicio: SqliteService;
  const query = vi.fn();

  beforeEach(() => {
    query.mockReset().mockResolvedValue({ values: [] });
    servicio = new SqliteService();
    // Solo se capturan SELECT; nunca se abre ni se modifica una base real.
    Object.assign(servicio, { db: { query } });
    vi.spyOn(servicio, 'initialize').mockRejectedValue(new Error('No abrir una base real'));
  });

  afterEach(() => {
    expect(servicio.initialize).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    'getResumenVentas',
    'getResumenCompras',
    'getRecaudoPorMetodo',
    'getCuentasCobrar',
    'getCuentasPagar',
  ] as const)('%s filtra por limites UTC del dia local y conserva el usuario', async (metodo) => {
    await servicio[metodo](DIA, 7);
    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/(?:\w+\.)?created_at >= \? AND (?:\w+\.)?created_at < \?/);
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('usuario_id = ?');
    expect(params).toEqual([...RANGO, 7]);
  });

  it.each([
    'getResumenVentas',
    'getResumenCompras',
    'getRecaudoPorMetodo',
    'getCuentasCobrar',
    'getCuentasPagar',
  ] as const)('%s sin fecha mantiene el historial completo', async (metodo) => {
    await servicio[metodo](null, 7);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('created_at >=');
    expect(params).toEqual([7]);
  });

  it('Ventas de hoy conserva el dia local despues de las 19:00', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T23:30:00'));
    await servicio.getResumenVentasHoy(7);
    expect(query.mock.calls[0][1]).toEqual([...RANGO, 7]);
    expect(query.mock.calls[0][0]).not.toContain("date('now')");
  });

  it('la actividad por usuario usa el mismo rango en todas las operaciones', async () => {
    await servicio.getActividadPorUsuario(DIA);
    const consultasConFecha = query.mock.calls.filter(([sql]) => sql.includes('created_at'));
    expect(consultasConFecha).toHaveLength(11);
    for (const [sql, params] of consultasConFecha) {
      expect(sql).toContain('created_at >= ? AND created_at < ?');
      expect(params).toEqual(RANGO);
    }
  });
});
