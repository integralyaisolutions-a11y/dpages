import type { CellValue } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { validarArticles } from './importar-articles.js';
import type { FilaCruda } from './lectura-xlsx.js';

function fila(numero: number, valors: Record<string, CellValue>): FilaCruda {
  return { fila: numero, valors };
}

describe('validarArticles', () => {
  const categoriesValides = new Set(['PECES NOBLES KG', 'PECES NOBLES PAQ']);

  it('fila válida: sin errores, queda en valides con los valores tal cual', () => {
    const resultat = validarArticles(
      [
        fila(2, {
          codi: 'LLF01',
          descripcio: 'Llom fresc de porc',
          categoria: 'PECES NOBLES KG',
          format: 'SENCER',
          envasat: 'NORMAL (pes)',
          pesKg: 1.25,
          preuVenda: 9.86,
        }),
      ],
      categoriesValides,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.valides).toHaveLength(1);
    expect(resultat.valides[0]).toMatchObject({
      codi: 'LLF01',
      descripcio: 'Llom fresc de porc',
      categoriaNom: 'PECES NOBLES KG',
      format: 'SENCER',
      envasat: 'NORMAL (pes)',
      pesKg: 1.25,
      preuVenda: 9.86,
    });
  });

  it('pesKg vacío es válido (artículo "a medida"), no genera error', () => {
    const resultat = validarArticles(
      [
        fila(2, {
          codi: 'SECR01',
          descripcio: 'Secret',
          categoria: 'PECES NOBLES KG',
          pesKg: null,
        }),
      ],
      categoriesValides,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.valides[0]?.pesKg).toBeNull();
  });

  it('categoria inexistente: error de validación, la fila no queda en valides', () => {
    const resultat = validarArticles(
      [fila(2, { codi: 'X01', descripcio: 'X', categoria: 'CATEGORIA QUE NO EXISTEIX' })],
      categoriesValides,
    );

    expect(resultat.errors).toContainEqual(expect.objectContaining({ fila: 2, camp: 'categoria' }));
    expect(resultat.valides).toHaveLength(0);
  });

  it('categoria vacía: error de validación (es obligatoria)', () => {
    const resultat = validarArticles(
      [fila(2, { codi: 'X01', descripcio: 'X', categoria: '' })],
      categoriesValides,
    );

    expect(resultat.errors).toContainEqual(
      expect.objectContaining({ fila: 2, camp: 'categoria', missatge: 'és obligatòria' }),
    );
  });

  it('format inválido: error de validación', () => {
    const resultat = validarArticles(
      [
        fila(2, {
          codi: 'X01',
          descripcio: 'X',
          categoria: 'PECES NOBLES KG',
          format: 'INVALIDO',
        }),
      ],
      categoriesValides,
    );

    expect(resultat.errors).toContainEqual(expect.objectContaining({ fila: 2, camp: 'format' }));
    expect(resultat.valides).toHaveLength(0);
  });

  it('envasat inválido: error de validación', () => {
    const resultat = validarArticles(
      [
        fila(2, {
          codi: 'X01',
          descripcio: 'X',
          categoria: 'PECES NOBLES KG',
          envasat: 'INVALIDO',
        }),
      ],
      categoriesValides,
    );

    expect(resultat.errors).toContainEqual(expect.objectContaining({ fila: 2, camp: 'envasat' }));
  });

  it('pesKg con texto no numérico: error de validación (distinto de vacío)', () => {
    const resultat = validarArticles(
      [
        fila(2, {
          codi: 'X01',
          descripcio: 'X',
          categoria: 'PECES NOBLES KG',
          pesKg: 'no-es-un-numero',
        }),
      ],
      categoriesValides,
    );

    expect(resultat.errors).toContainEqual(expect.objectContaining({ fila: 2, camp: 'pesKg' }));
  });

  it('codi duplicado en el archivo: se queda con la última fila, se reporta en duplicats', () => {
    const resultat = validarArticles(
      [
        fila(2, { codi: 'X01', descripcio: 'Primera versión', categoria: 'PECES NOBLES KG' }),
        fila(3, { codi: 'X01', descripcio: 'Segunda versión', categoria: 'PECES NOBLES KG' }),
      ],
      categoriesValides,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.valides).toHaveLength(1);
    expect(resultat.valides[0]?.descripcio).toBe('Segunda versión');
    expect(resultat.duplicats).toEqual([{ fila: 3, codi: 'X01' }]);
  });

  it('reporta TODOS los errores juntos, no sólo el primero', () => {
    const resultat = validarArticles(
      [
        fila(2, {
          codi: '',
          descripcio: '',
          categoria: 'CATEGORIA QUE NO EXISTEIX',
          format: 'MAL',
        }),
        fila(3, { codi: 'OK01', descripcio: 'Bien', categoria: 'PECES NOBLES KG' }),
      ],
      categoriesValides,
    );

    // codi, descripcio, categoria y format de la fila 2 — cuatro errores.
    expect(resultat.errors.filter((e) => e.fila === 2)).toHaveLength(4);
    expect(resultat.errors.filter((e) => e.fila === 3)).toHaveLength(0);
  });
});
