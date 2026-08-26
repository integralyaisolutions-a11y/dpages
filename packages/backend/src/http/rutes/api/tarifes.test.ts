import type { ComandaDetallApi, MatriuTarifesApi, TarifaResumApi } from '@dpages/shared';
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

  describe('DELETE /tarifes/:tarifaId/preus/:producteId (capa 28)', () => {
    it('borra un precio existente: 204, la matriz vuelve a null, y una comanda nueva cae al precio de catàleg (no a 0 ni error)', async () => {
      const fastify = construirServidor();

      // Producto CON precio de catálogo propio — necesario para distinguir
      // "cayó a catálogo" de "quedó en 0.00 / sense preu" en la aserción
      // final. pes_kg fijo (fitxa) para no tener que mandar kgDemanats.
      const producte = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO producte (codi, descripcio, tipus, pes_kg, preu_venda)
         VALUES ('CAP28-P', 'Article amb preu de catàleg', 'simple', '1.000', '5.00') RETURNING id_seq`,
      );
      const producteCatalegId = Number(producte.rows[0]!.id_seq);

      const tarifaPropia = await entorn.poolTest.query<{ id_seq: string; id: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP28-T', 'Tarifa capa 28') RETURNING id_seq, id`,
      );
      const tarifaPropiaId = Number(tarifaPropia.rows[0]!.id_seq);

      const client = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO client (nom, poblacio, tarifa_id) VALUES ('Client capa 28', 'Vic', $1) RETURNING id_seq`,
        [tarifaPropia.rows[0]!.id],
      );
      const clientId = Number(client.rows[0]!.id_seq);

      // Precio de TARIFA distinto al de catálogo, para que las dos
      // aserciones (antes/después) no puedan confundirse entre sí.
      await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/tarifes/${tarifaPropiaId}/preus/${producteCatalegId}`,
        payload: { preu: '9.99' },
      });

      const abans = cuerpoJson<MatriuTarifesApi>(
        await fastify.inject({ method: 'GET', url: '/api/v1/tarifes/matriu' }),
      );
      expect(
        abans.dades.find((d) => d.producteId === producteCatalegId)?.preus[String(tarifaPropiaId)],
      ).toBe('9.99');

      const del = await fastify.inject({
        method: 'DELETE',
        url: `/api/v1/tarifes/${tarifaPropiaId}/preus/${producteCatalegId}`,
      });
      expect(del.statusCode).toBe(204);

      const despres = cuerpoJson<MatriuTarifesApi>(
        await fastify.inject({ method: 'GET', url: '/api/v1/tarifes/matriu' }),
      );
      expect(
        despres.dades.find((d) => d.producteId === producteCatalegId)?.preus[
          String(tarifaPropiaId)
        ],
      ).toBeNull();

      // La prueba real: una línea de pedido nueva con este cliente/producto
      // ya no encuentra tarifa_preu — la cascada (resolverPreuLinia) tiene
      // que caer al preu_venda de catálogo, no a "0.00 sense preu".
      const comanda = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          clientId,
          linies: [{ producteId: producteCatalegId, unitatsDemanades: 1 }],
        },
      });
      expect(comanda.statusCode).toBe(201);
      const detall = cuerpoJson<ComandaDetallApi>(comanda);
      expect(detall.linies[0]?.preuUnitari).toBe('5.00');
      expect(detall.estat).toBe('oberta'); // no amb_incidencia: hubo precio real, no sensePreu

      await fastify.close();
    });

    it('borrar un precio que nunca existió da 404 NO_TROBAT (mismo criterio que el resto de DELETE del proyecto)', async () => {
      const producte = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO producte (codi, descripcio, tipus) VALUES ('CAP28-SP', 'Sense preu de tarifa', 'simple') RETURNING id_seq`,
      );
      const tarifa = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP28-T2', 'Tarifa capa 28 (b)') RETURNING id_seq`,
      );

      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'DELETE',
        url: `/api/v1/tarifes/${tarifa.rows[0]!.id_seq}/preus/${producte.rows[0]!.id_seq}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

      await fastify.close();
    });

    it('borrar con tarifaId inexistente da 404 NO_TROBAT', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'DELETE',
        url: `/api/v1/tarifes/999999/preus/${producteId}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

      await fastify.close();
    });

    it('borrar con producteId inexistente da 404 NO_TROBAT', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'DELETE',
        url: `/api/v1/tarifes/${tarifaId}/preus/999999`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

      await fastify.close();
    });
  });

  it('GET /tarifes/matriu: una tarifa vieja sin codi (NULL) no rompe la matriz ni desaparece del listado', async () => {
    // Reproduce el caso real: tarifas creadas antes de la migración 0010
    // (o cargadas a mano sin codi) conviven con las que sí lo tienen.
    const tarifaSinCodi = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO tarifa (nom) VALUES ('Tarifa Antiga Sense Codi') RETURNING id_seq`,
    );
    const tarifaSinCodiId = Number(tarifaSinCodi.rows[0]!.id_seq);

    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/tarifes/matriu' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<MatriuTarifesApi>(res);
    expect(cuerpo.tarifes).toContainEqual({
      id: tarifaSinCodiId,
      codi: null,
      nom: 'Tarifa Antiga Sense Codi',
    });
    // La tarifa con codi (del beforeAll) sigue apareciendo igual, sin verse afectada.
    expect(cuerpo.tarifes).toContainEqual({ id: tarifaId, codi: 'GEN', nom: 'General' });

    await fastify.close();
  });

  it('POST /tarifes crea una tarifa nueva', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/tarifes',
      payload: { codi: 'VIP', nom: 'Clients VIP' },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<TarifaResumApi>(res);
    expect(cuerpo).toMatchObject({ codi: 'VIP', nom: 'Clients VIP' });

    await fastify.close();
  });

  it('POST /tarifes amb un codi ja existent da 409 CONFLICTE', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/tarifes',
      payload: { codi: 'GEN', nom: 'Duplicada' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

    await fastify.close();
  });

  it('POST /tarifes sense codi da 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/tarifes',
      payload: { nom: 'Sense codi' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });
});
