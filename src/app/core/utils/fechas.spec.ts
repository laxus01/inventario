import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agruparPorFecha,
  etiquetaFecha,
  fechaHoraLocal,
  fechaLocalIso,
  hoyIso,
  rangoDiaUtc,
} from './fechas';

function sqliteUtc(fecha: Date): string {
  return fecha.toISOString().slice(0, 19).replace('T', ' ');
}

afterEach(() => vi.useRealTimers());

describe('fechas locales con almacenamiento UTC', () => {
  it.each(['00:00:00', '18:59:59', '19:00:00', '23:59:59'])(
    'mantiene el dia local a las %s para SQLite e ISO',
    (hora) => {
      const instante = new Date(`2026-10-16T${hora}`);
      expect(fechaLocalIso(sqliteUtc(instante))).toBe('2026-10-16');
      expect(fechaLocalIso(instante.toISOString())).toBe('2026-10-16');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(instante);
      expect(hoyIso()).toBe('2026-10-16');
    },
  );

  it.each(['2026-10-31', '2026-12-31', '2028-02-29'])(
    'conserva el dia local al terminar %s',
    (dia) => {
      const instante = new Date(`${dia}T23:59:59`);
      expect(fechaLocalIso(sqliteUtc(instante))).toBe(dia);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(instante);
      expect(hoyIso()).toBe(dia);
    },
  );

  it('respeta el offset explicito recibido de la API', () => {
    expect(fechaLocalIso('2026-10-16T19:30:00-05:00'))
      .toBe(fechaLocalIso('2026-10-17T00:30:00Z'));
  });

  it('no desplaza valores que solo contienen una fecha', () => {
    expect(fechaLocalIso('2026-10-16')).toBe('2026-10-16');
    expect(fechaHoraLocal('2026-10-16')).toBe('16/10/2026');
  });

  it('maneja fechas ausentes o invalidas', () => {
    for (const valor of [null, undefined, '', 'sin fecha']) {
      expect(fechaLocalIso(valor)).toBe('');
    }
    expect(fechaHoraLocal(null)).toBe('');
    expect(fechaHoraLocal('sin fecha')).toBe('sin fecha');
    expect(etiquetaFecha('')).toBe('');
  });

  it('muestra Hoy y Ayer usando el calendario local despues de las 19:00', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T23:30:00'));
    expect(etiquetaFecha('2026-10-16')).toMatch(/^Hoy /);
    expect(etiquetaFecha('2026-10-15')).toMatch(/^Ayer /);
    expect(etiquetaFecha('2026-10-17')).not.toMatch(/^(Hoy|Ayer) /);
  });

  it('cambia Hoy y Ayer solo al pasar la medianoche local', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-01T00:00:00'));
    expect(hoyIso()).toBe('2027-01-01');
    expect(etiquetaFecha('2026-12-31')).toMatch(/^Ayer /);
  });

  it('usa el dia anterior de calendario, no un intervalo fijo de 24 horas', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-09T00:30:00'));
    expect(etiquetaFecha('2026-03-08')).toMatch(/^Ayer /);
  });

  it('agrupa juntos registros de un mismo dia local a ambos lados de las 19:00', () => {
    const registros = ['18:59:59', '19:00:00', '23:59:59'].map((hora) => ({
      created_at: sqliteUtc(new Date(`2026-10-16T${hora}`)),
    }));
    expect(agruparPorFecha(registros, (r) => fechaLocalIso(r.created_at)))
      .toEqual([{ fecha: '2026-10-16', items: registros }]);
  });

  it('formatea la hora local del recibo sin cambiar el dato UTC original', () => {
    const instante = new Date('2026-10-16T19:05:00');
    const guardada = sqliteUtc(instante);
    expect(fechaHoraLocal(guardada)).toBe('16/10/2026 19:05');
    expect(fechaHoraLocal(instante.toISOString())).toBe('16/10/2026 19:05');
    expect(guardada).toBe(sqliteUtc(instante));
  });

  it.each(['2026-10-16', '2026-12-31', '2028-02-29', '2026-03-08', '2026-11-01'])(
    'calcula el rango UTC del dia %s, incluido un cambio de horario estacional',
    (dia) => {
      const [a, m, d] = dia.split('-').map(Number);
      const inicio = new Date(a, m - 1, d);
      const fin = new Date(a, m - 1, d + 1);
      const rango = rangoDiaUtc(dia);
      expect(rango).toEqual([sqliteUtc(inicio), sqliteUtc(fin)]);
      const ultimaHora = sqliteUtc(new Date(a, m - 1, d, 23, 59, 59));
      expect(ultimaHora >= rango[0] && ultimaHora < rango[1]).toBe(true);
      expect(sqliteUtc(fin) < rango[1]).toBe(false);
    },
  );
});
