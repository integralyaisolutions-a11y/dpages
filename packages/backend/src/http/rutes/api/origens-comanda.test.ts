import type { OrigenComandaApi, RespostaPaginada } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
  promoureAAdministrador,
} from './test-suport.js';

describe('API negoci — /origens-comanda (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    // prepararEntornApi ja insereix woocommerce/manual (fixture mínima per
    // poder crear comandes) — acà sumem els 3 canals nous d'aquesta capa
    // per poder testejar GET amb les 5 files reals.
    entorn = await prepararEntornApi('origens-comanda');
    construirServidor = entorn.construirServidor;
    await entorn.poolTest.query(
      `INSERT INTO origen_comanda (codi, nom) VALUES ('whatsapp', 'WhatsApp'), ('telefon', 'Telèfon'), ('correu', 'Correu')`,
    );
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /origens-comanda retorna les 5 files', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/origens-comanda' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RespostaPaginada<OrigenComandaApi>>(res);
    expect(cuerpo.dades.map((o) => o.codi).sort()).toEqual([
      'correu',
      'manual',
      'telefon',
      'whatsapp',
      'woocommerce',
    ]);
    expect(cuerpo.paginacio.total).toBe(5);

    await fastify.close();
  });

  it('POST /origens-comanda: sense el mòdul "comandes" dona 403 SENSE_PERMIS', async () => {
    const fastify = construirServidor();
    // Els dos rols seedejats avui (Administrador, General) INCLOUEN
    // "comandes" (migració 0014) — no hi ha cap rol real amb el que es
    // pugui provocar aquest 403. Es fabrica un rol sintètic sense el mòdul,
    // només per exercitar el guard mateix, no un escenari real d'avui.
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });
    await entorn.poolTest.query(
      `INSERT INTO rol (nom, moduls_permesos) VALUES ('SenseComandes', ARRAY['catalog'])
       ON CONFLICT (nom) DO NOTHING`,
    );
    await entorn.poolTest.query(
      `UPDATE usuari SET rol_id = (SELECT id FROM rol WHERE nom = 'SenseComandes')
       WHERE firebase_uid = 'dev-sense-auth'`,
    );
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/origens-comanda',
      payload: { codi: 'fax', nom: 'Fax' },
    });

    expect(res.statusCode).toBe(403);
    await fastify.close();
  });

  it('POST /origens-comanda: amb el mòdul "comandes" crea l\'origen', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/origens-comanda',
      payload: { codi: 'fax', nom: 'Fax' },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<OrigenComandaApi>(res);
    expect(cuerpo).toMatchObject({ codi: 'fax', nom: 'Fax', actiu: true });

    await fastify.close();
  });

  it('POST /origens-comanda: codi repetit dona 409 CONFLICTE', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/origens-comanda',
      payload: { codi: 'manual', nom: 'Duplicat' },
    });

    expect(res.statusCode).toBe(409);
    await fastify.close();
  });

  it('PATCH /origens-comanda/:id: canvia nom/actiu però ignora un codi enviat al cos', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const fila = await entorn.poolTest.query<{ id_seq: string }>(
      `SELECT id_seq FROM origen_comanda WHERE codi = 'telefon'`,
    );
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/origens-comanda/${fila.rows[0]!.id_seq}`,
      payload: { nom: 'Telèfon (canviat)', codi: 'intent-de-canvi', actiu: false },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<OrigenComandaApi>(res);
    expect(cuerpo).toMatchObject({ codi: 'telefon', nom: 'Telèfon (canviat)', actiu: false });

    await fastify.close();
  });
});
