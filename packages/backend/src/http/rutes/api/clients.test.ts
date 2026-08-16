import type { ClientApi, ClientCreacioApi, RespostaPaginada } from '@dpages/shared';
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

  describe('POST /clients — alta manual (capa 11, prototipo /pedidos/nuevo)', () => {
    it('con los campos mínimos del prototipo (codi, nom, poblacio) más tarifaId: crea el cliente y devuelve 201', async () => {
      const fastify = construirServidor();
      const cos: ClientCreacioApi = {
        codi: 'CLI100',
        nom: 'Forn del Barri',
        poblacio: 'Vic',
        tarifaId,
      };
      const res = await fastify.inject({ method: 'POST', url: '/api/v1/clients', payload: cos });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ClientApi>(res);
      expect(cuerpo).toMatchObject({
        codi: 'CLI100',
        nom: 'Forn del Barri',
        poblacio: 'Vic',
        tarifa: { id: tarifaId, nom: 'Restaurants' },
        email: null,
        telefon: null,
        nif: null,
        actiu: true,
      });

      const fila = await entorn.poolTest.query<{ codi: string }>(
        `SELECT codi FROM client WHERE id_seq = $1`,
        [cuerpo.id],
      );
      expect(fila.rows[0]?.codi).toBe('CLI100');

      await fastify.close();
    });

    it('con email/telefon/nif (no están en el modal del prototipo, pero hacen falta para WhatsApp/teléfono)', async () => {
      const fastify = construirServidor();
      const cos: ClientCreacioApi = {
        codi: 'CLI101',
        nom: 'Cliente Telefónico',
        poblacio: 'Manresa',
        email: 'contacte@example.com',
        telefon: '600111222',
        nif: 'NIF-TEL-101',
      };
      const res = await fastify.inject({ method: 'POST', url: '/api/v1/clients', payload: cos });

      expect(res.statusCode).toBe(201);
      expect(cuerpoJson<ClientApi>(res)).toMatchObject({
        email: 'contacte@example.com',
        telefon: '600111222',
        nif: 'NIF-TEL-101',
        tarifa: null,
      });

      await fastify.close();
    });

    it('sin codi/nom/poblacio rechaza con 400 VALIDACIO, indicando los tres campos', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({ method: 'POST', url: '/api/v1/clients', payload: {} });

      expect(res.statusCode).toBe(400);
      const cuerpo = res.json<{ error: { codi: string; detalls: { camp: string }[] } }>();
      expect(cuerpo.error.codi).toBe('VALIDACIO');
      expect(cuerpo.error.detalls.map((d) => d.camp).sort()).toEqual(['codi', 'nom', 'poblacio']);

      await fastify.close();
    });

    it('con tarifaId inexistente rechaza con 400 VALIDACIO, sin crear el cliente', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/clients',
        payload: {
          codi: 'CLI102',
          nom: 'No debería crearse',
          poblacio: 'Manresa',
          tarifaId: 999999,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      const fila = await entorn.poolTest.query<{ count: string }>(
        `SELECT count(*) FROM client WHERE codi = 'CLI102'`,
      );
      expect(fila.rows[0]?.count).toBe('0');

      await fastify.close();
    });
  });
});
