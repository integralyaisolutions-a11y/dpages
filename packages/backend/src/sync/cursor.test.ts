import { describe, expect, it } from 'vitest';
import { calcularFinestraConsulta, calcularNouCursor, SOLAPAMENT_MS_DEFECTE } from './cursor.js';

describe('calcularFinestraConsulta', () => {
  it('sin cursor previo, pide carga completa (sin modified_after)', () => {
    const finestra = calcularFinestraConsulta(null);
    expect(finestra.esCarregaCompleta).toBe(true);
    expect(finestra.modifiedAfter).toBeUndefined();
  });

  it('con cursor previo, resta el solapamiento por defecto (5 minutos)', () => {
    const cursor = new Date(Date.UTC(2026, 7, 15, 12, 0, 0));
    const finestra = calcularFinestraConsulta(cursor);

    expect(finestra.esCarregaCompleta).toBe(false);
    // 12:00:00 - 5min = 11:55:00 UTC, formateado como WooCommerce
    expect(finestra.modifiedAfter).toBe('2026-08-15T11:55:00');
  });

  it('acepta una ventana de solapamiento configurable, no sólo el default', () => {
    const cursor = new Date(Date.UTC(2026, 7, 15, 12, 0, 0));
    const finestra = calcularFinestraConsulta(cursor, 60_000); // 1 minuto

    expect(finestra.modifiedAfter).toBe('2026-08-15T11:59:00');
  });

  it('SOLAPAMENT_MS_DEFECTE son exactamente 5 minutos', () => {
    expect(SOLAPAMENT_MS_DEFECTE).toBe(5 * 60 * 1000);
  });
});

describe('calcularNouCursor', () => {
  it('devuelve la fecha más reciente del lote', () => {
    const nuevo = calcularNouCursor([
      '2026-08-01T10:00:00',
      '2026-08-03T08:30:00',
      '2026-08-02T23:59:59',
    ]);
    expect(nuevo?.toISOString()).toBe('2026-08-03T08:30:00.000Z');
  });

  it('devuelve null ante un lote vacío — el llamador conserva el cursor anterior', () => {
    expect(calcularNouCursor([])).toBeNull();
  });

  it('interpreta las fechas como UTC, no como hora local (sin sufijo "Z")', () => {
    const nuevo = calcularNouCursor(['2026-08-15T23:30:00']);
    expect(nuevo?.getTime()).toBe(Date.UTC(2026, 7, 15, 23, 30, 0));
  });
});
