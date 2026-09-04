import { describe, expect, it } from 'vitest';
import { contarPorCategoria, contarSinSku } from './carga-completa-cataleg.js';

/**
 * Capa 51 — sólo se testea acá lo genuinamente nuevo de este script
 * (`contarPorCategoria`/`contarSinSku`, para el informe del dry-run).
 * `ingerirCataleg`/`transformarCataleg` (reusadas sin cambios) ya tienen su
 * propia cobertura en sync/ingesta.test.ts y transform/cataleg.test.ts —
 * duplicarla acá no aporta nada.
 */
describe('contarPorCategoria', () => {
  it('agrupa por la PRIMERA categoría de cada producto, mismo criterio que obtenirOCrearArticle', () => {
    const conteo = contarPorCategoria([
      { categories: [{ id: 1, name: 'Fresc', slug: 'fresc' }] },
      { categories: [{ id: 1, name: 'Fresc', slug: 'fresc' }] },
      {
        categories: [
          { id: 2, name: 'Curat', slug: 'curat' },
          { id: 1, name: 'Fresc', slug: 'fresc' }, // segunda categoría — se ignora
        ],
      },
    ]);

    expect(conteo).toEqual(
      new Map([
        ['Fresc', 2],
        ['Curat', 1],
      ]),
    );
  });

  it('productos sin ninguna categoría cuentan aparte, como "(sin categoría)"', () => {
    const conteo = contarPorCategoria([{ categories: [] }, { categories: [] }]);
    expect(conteo).toEqual(new Map([['(sin categoría)', 2]]));
  });

  it('lista vacía da un mapa vacío', () => {
    expect(contarPorCategoria([])).toEqual(new Map());
  });
});

describe('contarSinSku', () => {
  it('cuenta sku null, vacío y sólo espacios como "sin SKU" — mismo criterio que skuNet en transform/cataleg.ts', () => {
    expect(contarSinSku([{ sku: 'LLF01' }, { sku: '' }, { sku: '   ' }, { sku: 'PIC01' }])).toBe(2);
  });

  it('todos con SKU real da 0', () => {
    expect(contarSinSku([{ sku: 'LLF01' }, { sku: 'PIC01' }])).toBe(0);
  });
});
