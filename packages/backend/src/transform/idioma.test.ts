import { describe, expect, it } from 'vitest';
import { inferirIdiomaHeuristic, resolverNomCategoriaCanonic } from './idioma.js';

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

describe('resolverNomCategoriaCanonic (mismo criterio que los artículos)', () => {
  it('el nombre catalán es su propio canónico', () => {
    expect(resolverNomCategoriaCanonic('Fresc')).toBe('Fresc');
  });

  it('el par castellano resuelve al MISMO nombre canónico (el catalán)', () => {
    expect(resolverNomCategoriaCanonic('Fresco')).toBe('Fresc');
  });

  it('otro par cualquiera de la lista verificada', () => {
    expect(resolverNomCategoriaCanonic('Conservas')).toBe('Conserves');
    expect(resolverNomCategoriaCanonic('Conserves')).toBe('Conserves');
  });

  it('una categoría no reconocida se usa tal cual, sin lanzar', () => {
    expect(resolverNomCategoriaCanonic('Categoría totalmente nueva')).toBe(
      'Categoría totalmente nueva',
    );
  });
});
