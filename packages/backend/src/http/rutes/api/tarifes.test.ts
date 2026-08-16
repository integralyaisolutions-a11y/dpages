import type { MatriuTarifesApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /tarifes (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let tarifaId: number;
  let producteId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('tarifes');
    construirServidor = entorn.construirServidor;

    const producte = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('LLF01', 'Llom fresc de porc', 'simple') RETURNING id_seq`,
    );
    producteId = Number(producte.rows[0]!.id_seq);
    const tarifa = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO tarifa (codi, nom) VALUES ('GEN', 'General') RETURNING id_seq`,
    );
    tarifaId = Number(tarifa.rows[0]!.id_seq);
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /tarifes/matriu: sin precio cargado, la celda es null (no un error)', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/tarifes/matriu' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<MatriuTarifesApi>(res);
    expect(cuerpo.tarifes).toEqual([{ id: tarifaId, codi: 'GEN', nom: 'General' }]);
    expect(cuerpo.dades[0]?.preus).toEqual({ [String(tarifaId)]: null });

    await fastify.close();
  });

  it('PATCH /tarifes/:tarifaId/preus/:producteId guarda una sola celda', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/tarifes/${tarifaId}/preus/${producteId}`,
      payload: { preu: '9.50' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ tarifaId, producteId, preu: '9.50' });

    const matriu = await fastify.inject({ method: 'GET', url: '/api/v1/tarifes/matriu' });
    expect(cuerpoJson<MatriuTarifesApi>(matriu).dades[0]?.preus[String(tarifaId)]).toBe('9.50');

    await fastify.close();
  });

  it('PATCH con un preu mal formado rechaza con 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/tarifes/${tarifaId}/preus/${producteId}`,
      payload: { preu: 'no-es-un-numero' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('PATCH con tarifa inexistente da 404 NO_TROBAT', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/tarifes/999999/preus/${producteId}`,
      payload: { preu: '9.50' },
    });

    expect(res.statusCode).toBe(404);

    await fastify.close();
  });
});
