import type { CellValue } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { validarTarifes } from './importar-tarifes.js';
import type { FilaCruda } from './lectura-xlsx.js';

function fila(numero: number, valors: Record<string, CellValue>): FilaCruda {
  return { fila: numero, valors };
}

describe('validarTarifes', () => {
  const articleCodisValids = new Set(['LLF01', 'COST01']);

  it('filas válidas (Tarifes + Preus): sin errores', () => {
    const resultat = validarTarifes(
      [fila(2, { codi: 'GEN', nom: 'General' })],
      [fila(2, { tarifaCodi: 'GEN', articleCodi: 'LLF01', preu: 9.86 })],
      articleCodisValids,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.tarifes).toEqual([{ fila: 2, codi: 'GEN', nom: 'General' }]);
    expect(resultat.preus).toEqual([
      { fila: 2, tarifaCodi: 'GEN', articleCodi: 'LLF01', preu: 9.86 },
    ]);
  });

  it('matriz dispersa: un artículo sin precio en una tarifa no es un error', () => {
    const resultat = validarTarifes(
      [fila(2, { codi: 'GEN', nom: 'General' }), fila(3, { codi: 'REST', nom: 'Restaurants' })],
      // Sólo LLF01 tiene precio en REST — COST01 queda sin precio ahí, y
      // eso es válido (matriz dispersa, no todas las combinaciones).
      [
        fila(2, { tarifaCodi: 'GEN', articleCodi: 'LLF01', preu: 9.86 }),
        fila(3, { tarifaCodi: 'GEN', articleCodi: 'COST01', preu: 7.5 }),
        fila(4, { tarifaCodi: 'REST', articleCodi: 'LLF01', preu: 8.9 }),
      ],
      articleCodisValids,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.preus).toHaveLength(3);
  });

  it('tarifaCodi de Preus que no existe en la hoja Tarifes del mismo archivo: error', () => {
    const resultat = validarTarifes(
      [fila(2, { codi: 'GEN', nom: 'General' })],
      [fila(2, { tarifaCodi: 'NO-EXISTE', articleCodi: 'LLF01', preu: 9.86 })],
      articleCodisValids,
    );

    expect(resultat.errors).toContainEqual(
      expect.objectContaining({ fila: 2, camp: 'tarifaCodi' }),
    );
    expect(resultat.preus).toHaveLength(0);
  });

  it('articleCodi de Preus que no existe en el catálogo ya importado: error', () => {
    const resultat = validarTarifes(
      [fila(2, { codi: 'GEN', nom: 'General' })],
      [fila(2, { tarifaCodi: 'GEN', articleCodi: 'NO-EXISTE', preu: 9.86 })],
      articleCodisValids,
    );

    expect(resultat.errors).toContainEqual(
      expect.objectContaining({ fila: 2, camp: 'articleCodi' }),
    );
    expect(resultat.errors[0]?.missatge).toContain('importar-articles.ts');
    expect(resultat.preus).toHaveLength(0);
  });

  it('preu negativo o no numérico: error de validación', () => {
    const resultat = validarTarifes(
      [fila(2, { codi: 'GEN', nom: 'General' })],
      [
        fila(2, { tarifaCodi: 'GEN', articleCodi: 'LLF01', preu: -1 }),
        fila(3, { tarifaCodi: 'GEN', articleCodi: 'COST01', preu: 'gratis' }),
      ],
      articleCodisValids,
    );

    expect(resultat.errors).toContainEqual(expect.objectContaining({ fila: 2, camp: 'preu' }));
    expect(resultat.errors).toContainEqual(expect.objectContaining({ fila: 3, camp: 'preu' }));
  });

  it('codi de tarifa duplicado dentro de la hoja Tarifes: se queda con la última, se reporta', () => {
    const resultat = validarTarifes(
      [
        fila(2, { codi: 'GEN', nom: 'Primera versión' }),
        fila(3, { codi: 'GEN', nom: 'Segunda versión' }),
      ],
      [],
      articleCodisValids,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.tarifes).toEqual([{ fila: 3, codi: 'GEN', nom: 'Segunda versión' }]);
    expect(resultat.duplicatsTarifes).toEqual([{ fila: 3, codi: 'GEN' }]);
  });

  it('pareja (tarifaCodi, articleCodi) duplicada en Preus: se queda con la última, se reporta', () => {
    const resultat = validarTarifes(
      [fila(2, { codi: 'GEN', nom: 'General' })],
      [
        fila(2, { tarifaCodi: 'GEN', articleCodi: 'LLF01', preu: 9.86 }),
        fila(3, { tarifaCodi: 'GEN', articleCodi: 'LLF01', preu: 10.0 }),
      ],
      articleCodisValids,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.preus).toHaveLength(1);
    expect(resultat.preus[0]?.preu).toBe(10.0);
    expect(resultat.duplicatsPreus).toEqual([{ fila: 3, tarifaCodi: 'GEN', articleCodi: 'LLF01' }]);
  });
});
