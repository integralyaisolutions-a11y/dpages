import type { RendimentPorcApi, RespostaPaginada } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /rendiments-porcs (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let producteLlomId: number;
  let producteCongelatId: number;
  let rendimentId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('rendiments-porcs');
    construirServidor = entorn.construirServidor;

    const fresc = await entorn.poolTest.query<{ id: string }>(
      `INSERT INTO categoria_producte (nom, elaborat_porc, agrupacio_rendiment)
       VALUES ('Fresc', true, 'KG') RETURNING id`,
    );
    const llom = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, tipus, categoria_id, agrupacio_produccio)
       VALUES ('LLF01', 'Llom fresc de porc', 'simple', $1, 'Llom') RETURNING id_seq`,
      [fresc.rows[0]!.id],
    );
    producteLlomId = Number(llom.rows[0]!.id_seq);

    const congelats = await entorn.poolTest.query<{ id: string }>(
      `INSERT INTO categoria_producte (nom, elaborat_porc) VALUES ('Congelats', false) RETURNING id`,
    );
    const congelat = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, tipus, categoria_id)
       VALUES ('CON01', 'Congelat sense rendiment', 'simple', $1) RETURNING id_seq`,
      [congelats.rows[0]!.id],
    );
    producteCongelatId = Number(congelat.rows[0]!.id_seq);
  });

  afterAll(() => netejarEntornApi(entorn));

  it('POST /rendiments-porcs crea una ficha nueva con los campos derivados', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rendiments-porcs',
      payload: { producteId: producteLlomId, unitatsPerPorc: '2.00', kgPerUnitat: '3.500' },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<RendimentPorcApi>(res);
    expect(cuerpo.producte).toEqual({
      id: producteLlomId,
      codi: 'LLF01',
      descripcio: 'Llom fresc de porc',
    });
    expect(cuerpo.agrupacioRendiment).toBe('KG');
    expect(cuerpo.categoria).toBe('Fresc');
    expect(cuerpo.agrupacioProduccio).toBe('Llom');
    expect(cuerpo.unitatsPerPorc).toBe('2.00');
    expect(cuerpo.kgPerUnitat).toBe('3.500');
    expect(cuerpo.pesTotal).toBe('7.000');
    rendimentId = cuerpo.id;

    await fastify.close();
  });

  it('POST /rendiments-porcs con un producte la categoria del qual no té agrupació de rendiment retorna 400', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rendiments-porcs',
      payload: { producteId: producteCongelatId, unitatsPerPorc: '1.00', kgPerUnitat: '1.000' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('POST /rendiments-porcs con producteId inexistent retorna 400', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rendiments-porcs',
      payload: { producteId: 999999, unitatsPerPorc: '1.00', kgPerUnitat: '1.000' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('GET /rendiments-porcs?agrupacioRendiment= filtra y devuelve la ficha creada', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/rendiments-porcs?agrupacioRendiment=KG',
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RespostaPaginada<RendimentPorcApi>>(res);
    expect(cuerpo.dades).toHaveLength(1);
    expect(cuerpo.dades[0]?.id).toBe(rendimentId);

    await fastify.close();
  });

  it('GET /rendiments-porcs?producte= exige coincidencia exacta (case-insensitive), no substring', async () => {
    const fastify = construirServidor();

    const exacte = await fastify.inject({
      method: 'GET',
      url: `/api/v1/rendiments-porcs?${new URLSearchParams({ producte: 'LLOM FRESC DE PORC' }).toString()}`,
    });
    const cuerpoExacte = cuerpoJson<RespostaPaginada<RendimentPorcApi>>(exacte);
    expect(cuerpoExacte.dades).toHaveLength(1);
    expect(cuerpoExacte.dades[0]?.producte.codi).toBe('LLF01');

    const substring = await fastify.inject({
      method: 'GET',
      url: '/api/v1/rendiments-porcs?producte=llom',
    });
    const cuerpoSubstring = cuerpoJson<RespostaPaginada<RendimentPorcApi>>(substring);
    expect(cuerpoSubstring.dades).toHaveLength(0);

    await fastify.close();
  });

  it('PATCH /rendiments-porcs/:id actualiza sólo el campo enviado', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/rendiments-porcs/${rendimentId}`,
      payload: { unitatsPerPorc: '4.00' },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RendimentPorcApi>(res);
    expect(cuerpo.unitatsPerPorc).toBe('4.00');
    expect(cuerpo.kgPerUnitat).toBe('3.500');
    expect(cuerpo.pesTotal).toBe('14.000');

    await fastify.close();
  });

  it('DELETE /rendiments-porcs/:id elimina la ficha y responde 204', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/v1/rendiments-porcs/${rendimentId}`,
    });

    expect(res.statusCode).toBe(204);

    const llista = await fastify.inject({ method: 'GET', url: '/api/v1/rendiments-porcs' });
    expect(cuerpoJson<RespostaPaginada<RendimentPorcApi>>(llista).paginacio.total).toBe(0);

    await fastify.close();
  });

  it('DELETE /rendiments-porcs/:id con un id inexistent da 404 NO_TROBAT', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'DELETE',
      url: '/api/v1/rendiments-porcs/999999',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

    await fastify.close();
  });
});
