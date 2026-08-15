import { describe, expect, it } from 'vitest';
import { inferirIdiomaHeuristic } from './idioma.js';

function producto(categorias: string[]) {
  return { id: 1, categories: categorias.map((name, i) => ({ id: i, name, slug: name })) };
}

describe('inferirIdiomaHeuristic (heurística provisoria)', () => {
  it('reconoce una categoría catalana verificada', () => {
    expect(inferirIdiomaHeuristic(producto(['Fresc']))).toBe('ca');
  });

  it('reconoce su par castellano', () => {
    expect(inferirIdiomaHeuristic(producto(['Fresco']))).toBe('es');
  });

  it('usa la primera categoría reconocible si el producto tiene varias', () => {
    expect(inferirIdiomaHeuristic(producto(['Categoria inventada', 'Conservas']))).toBe('es');
  });

  it('cae al default (ca) si no hay ninguna categoría reconocible, sin lanzar', () => {
    expect(inferirIdiomaHeuristic(producto(['Categoria totalmente nueva']))).toBe('ca');
  });

  it('cae al default (ca) si el producto no tiene categorías', () => {
    expect(inferirIdiomaHeuristic(producto([]))).toBe('ca');
  });
});
