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

  it('POST /categories crea una categoria nueva', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { nom: 'Elaborats', elaboratPorc: true, agrupacioRendiment: 'MAGRE' },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<CategoriaApi>(res);
    expect(cuerpo).toMatchObject({
      nom: 'Elaborats',
      elaboratPorc: true,
      agrupacioRendiment: 'MAGRE',
    });

    await fastify.close();
  });

  it('POST /categories con agrupacioRendiment y elaboratPorc false da 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { nom: 'Sense elaborar', elaboratPorc: false, agrupacioRendiment: 'KG' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('DELETE /categories/:id con productes actius associats da 409 CONFLICTE', async () => {
    const categoriaEnUs = await entorn.poolTest.query<{ id: string; id_seq: string }>(
      `INSERT INTO categoria_producte (nom) VALUES ('En ús') RETURNING id, id_seq`,
    );
    await entorn.poolTest.query(
      `INSERT INTO producte (descripcio, tipus, categoria_id, actiu) VALUES ('Article en ús', 'simple', $1, true)`,
      [categoriaEnUs.rows[0]!.id],
    );

    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/v1/categories/${categoriaEnUs.rows[0]!.id_seq}`,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

    await fastify.close();
  });

  it('DELETE /categories/:id sense productes associats elimina i respon 204', async () => {
    const categoriaLliure = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO categoria_producte (nom) VALUES ('Sense ús') RETURNING id_seq`,
    );

    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/v1/categories/${categoriaLliure.rows[0]!.id_seq}`,
    });

    expect(res.statusCode).toBe(204);

    await fastify.close();
  });

  it('DELETE /categories/:id amb un id inexistent da 404 NO_TROBAT', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'DELETE', url: '/api/v1/categories/999999' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

    await fastify.close();
  });
});
