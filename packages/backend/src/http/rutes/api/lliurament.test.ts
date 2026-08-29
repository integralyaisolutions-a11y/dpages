import { randomUUID } from 'node:crypto';
import type { ComandaDetallApi, CosErrorApi, LliuramentRespostaApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — PATCH .../lliurament (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let comandaId: number;
  let liniaId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('lliurament');
    construirServidor = entorn.construirServidor;
  });

  afterAll(() => netejarEntornApi(entorn));

  async function crearComandaAmbLinia(
    fastify: ReturnType<typeof construirServidor>,
  ): Promise<void> {
    // codi único por llamada: cada test de este archivo comparte el mismo
    // esquema/pool, y `codi` tiene un índice único parcial.
    const codi = `LLF01-${randomUUID().slice(0, 8)}`;
    const producte = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, pes_kg, preu_venda, tipus)
       VALUES ($1, 'Llom fresc de porc', '1.250', '9.86', 'simple') RETURNING id_seq`,
      [codi],
    );
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'manual',
        linies: [{ producteId: Number(producte.rows[0]!.id_seq), unitatsDemanades: 8 }],
      },
    });
    const cos = cuerpoJson<ComandaDetallApi>(res);
    comandaId = cos.id;
    liniaId = cos.linies[0]!.id;
  }

  it('confirma la entrega: obligatorio, arranca en cero, una sola llamada confirma y graba', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament`,
      payload: { unitatsLliurades: 8, kgLliurats: '9.750' },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<LliuramentRespostaApi>(res);
    expect(cuerpo).toMatchObject({
      liniaId,
      comandaId,
      unitatsLliurades: '8.00', // capa 38 — NUMERIC(10,2), string
      kgLliurats: '9.750',
    });
    expect(cuerpo.confirmatA).toMatch(/Z$/);
    // AUTH_DISABLED=true (default de test, ver vitest.config.ts): el middleware
    // de auth (ADR-021) adjunta el uid fijo 'dev-sense-auth' en vez de exigir
    // un token real, y resoldre-usuari.ts lo auto-provisiona (capa 17) la
    // primera vez que lo ve — de ahí que nom caiga al email sintético.
    expect(cuerpo.confirmatPer.id).toBeGreaterThan(0);
    expect(cuerpo.confirmatPer.nom).toBe('dev-sense-auth@dpages.local');

    await fastify.close();
  });

  it('rechaza con 400 VALIDACIO si unitatsLliurades o kgLliurats quedan en cero, aunque coincidan con lo pedido', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);

    const sinUnitats = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament`,
      payload: { unitatsLliurades: 0, kgLliurats: '9.750' },
    });
    expect(sinUnitats.statusCode).toBe(400);
    expect(cuerpoJson<CosErrorApi>(sinUnitats).error.detalls).toContainEqual(
      expect.objectContaining({ camp: 'unitatsLliurades' }),
    );

    const sinKg = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament`,
      payload: { unitatsLliurades: 8, kgLliurats: '0' },
    });
    expect(sinKg.statusCode).toBe(400);
    expect(cuerpoJson<CosErrorApi>(sinKg).error.detalls).toContainEqual(
      expect.objectContaining({ camp: 'kgLliurats' }),
    );

    await fastify.close();
  });

  it('rechaza con 409 CONFLICTE si la comanda está congelada', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);
    await entorn.poolTest.query(`UPDATE comanda SET congelat_a = now() WHERE id_seq = $1`, [
      comandaId,
    ]);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament`,
      payload: { unitatsLliurades: 8, kgLliurats: '9.750' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

    await fastify.close();
  });

  it('capa 38 — entrega parcial de pieza: unitatsLliurades = 2.5 aplica correcto y se devuelve como string', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament`,
      payload: { unitatsLliurades: 2.5, kgLliurats: '3.125' },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<LliuramentRespostaApi>(res);
    expect(typeof cuerpo.unitatsLliurades).toBe('string');
    expect(cuerpo.unitatsLliurades).toBe('2.50');

    const fila = await entorn.poolTest.query<{ unitats_lliurades: string }>(
      `SELECT unitats_lliurades FROM comanda_linia WHERE id_seq = $1`,
      [liniaId],
    );
    expect(fila.rows[0]?.unitats_lliurades).toBe('2.50');

    await fastify.close();
  });

  it('capa 38 — unitatsLliurades amb més de 2 decimals rebutja amb 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament`,
      payload: { unitatsLliurades: 2.567, kgLliurats: '3.125' },
    });

    expect(res.statusCode).toBe(400);
    expect(cuerpoJson<CosErrorApi>(res).error.detalls).toContainEqual(
      expect.objectContaining({ camp: 'unitatsLliurades' }),
    );

    await fastify.close();
  });
});
