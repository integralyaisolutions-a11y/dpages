import type { ClientApi, RespostaPaginada } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /clients (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let clientId: number;
  let tarifaId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('clients');
    construirServidor = entorn.construirServidor;

    const client = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO client (nom, poblacio) VALUES ('Restaurant Example', 'Manresa') RETURNING id_seq`,
    );
    clientId = Number(client.rows[0]!.id_seq);
    const tarifa = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO tarifa (nom) VALUES ('Restaurants') RETURNING id_seq`,
    );
    tarifaId = Number(tarifa.rows[0]!.id_seq);
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /clients devuelve la forma del contrato', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/clients' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RespostaPaginada<ClientApi>>(res);
    expect(cuerpo.dades[0]).toMatchObject({
      id: clientId,
      nom: 'Restaurant Example',
      poblacio: 'Manresa',
      tarifa: null,
      transportistaDefecte: null,
      actiu: true,
    });

    await fastify.close();
  });

  it('PATCH /clients/:id asigna tarifa', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/clients/${clientId}`,
      payload: { tarifaId },
    });

    expect(res.statusCode).toBe(200);
    expect(cuerpoJson<ClientApi>(res).tarifa).toEqual({ id: tarifaId, nom: 'Restaurants' });

    await fastify.close();
  });

  it('PATCH /clients/:id con tarifa inexistente rechaza con 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/clients/${clientId}`,
      payload: { tarifaId: 999999 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });
});
