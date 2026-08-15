import { describe, expect, it } from 'vitest';
import { formatearFechaGmt, parsearFechaGmt } from './fechas.js';

describe('parsearFechaGmt', () => {
  it('interpreta una cadena sin sufijo de zona como UTC, no como hora local', () => {
    // Si esto se interpretara como hora local en cualquier huso distinto de
    // UTC+0, el timestamp resultante sería otro — por eso se compara contra
    // el valor absoluto en milisegundos calculado a mano en UTC.
    const fecha = parsearFechaGmt('2026-05-12T09:02:00');
    expect(fecha.getTime()).toBe(Date.UTC(2026, 4, 12, 9, 2, 0));
  });

  it('acepta también una cadena que ya trae "Z"', () => {
    const fecha = parsearFechaGmt('2026-05-12T09:02:00Z');
    expect(fecha.getTime()).toBe(Date.UTC(2026, 4, 12, 9, 2, 0));
  });

  it('rechaza una fecha inválida en vez de devolver "Invalid Date" silenciosamente', () => {
    expect(() => parsearFechaGmt('no-es-una-fecha')).toThrow(/inválida/);
  });
});

describe('formatearFechaGmt', () => {
  it('produce el mismo formato que WooCommerce: sin milisegundos ni "Z"', () => {
    const fecha = new Date(Date.UTC(2026, 4, 12, 9, 2, 0, 123));
    expect(formatearFechaGmt(fecha)).toBe('2026-05-12T09:02:00');
  });

  it('es la inversa de parsearFechaGmt para una fecha con segundos exactos', () => {
    const original = '2026-08-01T00:00:00';
    expect(formatearFechaGmt(parsearFechaGmt(original))).toBe(original);
  });
});
