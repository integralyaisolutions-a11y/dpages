import type { CategoriaApi, RespostaPaginada } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /categories (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let categoriaId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('categories');
    construirServidor = entorn.construirServidor;

    const fila = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO categoria_producte (nom) VALUES ('Fresc') RETURNING id_seq`,
    );
    categoriaId = Number(fila.rows[0]!.id_seq);
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /categories devuelve id secuencial, no el UUID interno', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/categories' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RespostaPaginada<CategoriaApi>>(res);
    expect(cuerpo.dades).toEqual([
      { id: categoriaId, nom: 'Fresc', elaboratPorc: false, agrupacioRendiment: null },
    ]);
    expect(cuerpo.paginacio).toEqual({ pagina: 1, mida: 50, total: 1, totalPagines: 1 });

    await fastify.close();
  });

  it('PATCH /categories/:id actualiza sólo los campos enviados', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${categoriaId}`,
      payload: { elaboratPorc: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: categoriaId,
      nom: 'Fresc',
      elaboratPorc: true,
      agrupacioRendiment: null,
    });

    await fastify.close();
  });

  it('PATCH /categories/:id con un id inexistente da 404 NO_TROBAT', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/categories/999999',
      payload: { elaboratPorc: true },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

    await fastify.close();
  });
});
