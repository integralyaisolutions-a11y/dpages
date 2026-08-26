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

  it('PATCH /clients/:id ignora un intent de canviar codi (capa 29 — immutable per sempre)', async () => {
    const previ = await entorn.poolTest.query<{ codi: string | null }>(
      `SELECT codi FROM client WHERE id_seq = $1`,
      [clientId],
    );

    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/clients/${clientId}`,
      payload: { codi: 'CODI-QUE-NO-HAURIA-DE-QUEDAR', nom: 'Restaurant Example (editat)' },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<ClientApi>(res);
    expect(cuerpo.nom).toBe('Restaurant Example (editat)'); // el resto del body sí se aplica
    expect(cuerpo.codi).toBe(previ.rows[0]?.codi ?? null); // codi, sin cambios
    expect(cuerpo.codi).not.toBe('CODI-QUE-NO-HAURIA-DE-QUEDAR');

    await fastify.close();
  });

  describe('POST /clients — alta manual (capa 11, prototipo /pedidos/nuevo; capa 29 — codi autogenerat)', () => {
    it('con los campos mínimos del prototipo (nom, poblacio) más tarifaId: crea el cliente y autogenera codi (CLI+id, sin padding)', async () => {
      const fastify = construirServidor();
      const cos: ClientCreacioApi = {
        nom: 'Forn del Barri',
        poblacio: 'Vic',
        tarifaId,
      };
      const res = await fastify.inject({ method: 'POST', url: '/api/v1/clients', payload: cos });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ClientApi>(res);
      expect(cuerpo.codi).toBe(`CLI${cuerpo.id}`);
      expect(cuerpo).toMatchObject({
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
      expect(fila.rows[0]?.codi).toBe(`CLI${cuerpo.id}`);

      await fastify.close();
    });

    it('un codi mandado en el body se ignora — sigue autogenerándose igual (capa 29, no es campo de entrada)', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/clients',
        payload: { codi: 'CODI-INVENTAT', nom: 'Cliente que manda codi', poblacio: 'Vic' },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ClientApi>(res);
      expect(cuerpo.codi).toBe(`CLI${cuerpo.id}`);
      expect(cuerpo.codi).not.toBe('CODI-INVENTAT');

      await fastify.close();
    });

    it('con email/telefon/nif (no están en el modal del prototipo, pero hacen falta para WhatsApp/teléfono)', async () => {
      const fastify = construirServidor();
      const cos: ClientCreacioApi = {
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

    it('sin nom/poblacio rechaza con 400 VALIDACIO, indicando los dos campos (codi ya no es obligatorio de entrada)', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({ method: 'POST', url: '/api/v1/clients', payload: {} });

      expect(res.statusCode).toBe(400);
      const cuerpo = res.json<{ error: { codi: string; detalls: { camp: string }[] } }>();
      expect(cuerpo.error.codi).toBe('VALIDACIO');
      expect(cuerpo.error.detalls.map((d) => d.camp).sort()).toEqual(['nom', 'poblacio']);

      await fastify.close();
    });

    it('con tarifaId inexistente rechaza con 400 VALIDACIO, sin crear el cliente', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/clients',
        payload: {
          nom: 'No debería crearse',
          poblacio: 'Manresa',
          tarifaId: 999999,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      const fila = await entorn.poolTest.query<{ count: string }>(
        `SELECT count(*) FROM client WHERE nom = 'No debería crearse'`,
      );
      expect(fila.rows[0]?.count).toBe('0');

      await fastify.close();
    });

    it('conflicto de unicidad de codi forzado da 409 CONFLICTE, no 500 (defensa en profundidad)', async () => {
      // Un cliente YA tiene el codi que el próximo id_seq va a generar
      // naturalmente — fuerza la colisión real contra idx_client_codi que
      // esViolacioCodiUnic tiene que traducir a 409, no dejar caer como 500.
      await entorn.poolTest.query(
        `INSERT INTO client (nom, poblacio, codi) VALUES ('Ocupa el codi', 'Vic', 'CLI5001')`,
      );
      await entorn.poolTest.query('ALTER TABLE client ALTER COLUMN id_seq RESTART WITH 5001');

      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/clients',
        payload: { nom: 'Xoca amb CLI5001', poblacio: 'Vic' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

      await fastify.close();
    });
  });
});
