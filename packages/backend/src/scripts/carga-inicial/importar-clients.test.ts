import type { CellValue } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { validarClients } from './importar-clients.js';
import type { FilaCruda } from './lectura-xlsx.js';

function fila(numero: number, valors: Record<string, CellValue>): FilaCruda {
  return { fila: numero, valors };
}

describe('validarClients', () => {
  const tarifaCodisValids = new Set(['GEN', 'REST']);

  it('fila válida (con tarifaCodi): sin errores', () => {
    const resultat = validarClients(
      [
        fila(2, {
          codi: 'CLI001',
          nom: 'Restaurant Example',
          poblacio: 'Manresa',
          tarifaCodi: 'REST',
        }),
      ],
      tarifaCodisValids,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.valids).toEqual([
      {
        fila: 2,
        codi: 'CLI001',
        nom: 'Restaurant Example',
        poblacio: 'Manresa',
        tarifaCodi: 'REST',
      },
    ]);
  });

  it('fila válida sin tarifaCodi: opcional, no es error', () => {
    const resultat = validarClients(
      [fila(2, { codi: 'CLI001', nom: 'Cliente sin tarifa', poblacio: 'Manresa', tarifaCodi: '' })],
      tarifaCodisValids,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.valids[0]?.tarifaCodi).toBeNull();
  });

  it('tarifaCodi informado pero inexistente: error de validación', () => {
    const resultat = validarClients(
      [fila(2, { codi: 'CLI001', nom: 'X', poblacio: 'Manresa', tarifaCodi: 'NO-EXISTE' })],
      tarifaCodisValids,
    );

    expect(resultat.errors).toContainEqual(
      expect.objectContaining({ fila: 2, camp: 'tarifaCodi' }),
    );
    expect(resultat.errors[0]?.missatge).toContain('importar-tarifes.ts');
    expect(resultat.valids).toHaveLength(0);
  });

  it('codi/nom/poblacio obligatorios: fila vacía da tres errores', () => {
    const resultat = validarClients(
      [fila(2, { codi: '', nom: '', poblacio: '' })],
      tarifaCodisValids,
    );

    expect(resultat.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fila: 2, camp: 'codi' }),
        expect.objectContaining({ fila: 2, camp: 'nom' }),
        expect.objectContaining({ fila: 2, camp: 'poblacio' }),
      ]),
    );
  });

  it('codi duplicado en el archivo: se queda con la última fila, se reporta en duplicats', () => {
    const resultat = validarClients(
      [
        fila(2, { codi: 'CLI001', nom: 'Primera versión', poblacio: 'Manresa' }),
        fila(3, { codi: 'CLI001', nom: 'Segunda versión', poblacio: 'Vic' }),
      ],
      tarifaCodisValids,
    );

    expect(resultat.errors).toEqual([]);
    expect(resultat.valids).toHaveLength(1);
    expect(resultat.valids[0]).toMatchObject({ nom: 'Segunda versión', poblacio: 'Vic' });
    expect(resultat.duplicats).toEqual([{ fila: 3, codi: 'CLI001' }]);
  });
});
