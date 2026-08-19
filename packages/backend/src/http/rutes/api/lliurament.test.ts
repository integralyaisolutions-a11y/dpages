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
      unitatsLliurades: 8,
      kgLliurats: '9.750',
    });
    expect(cuerpo.confirmatA).toMatch(/Z$/);
    // AUTH_DISABLED=true (default de test, ver vitest.config.ts): el middleware
    // (ADR-021) adjunta este uid fijo de desarrollo en vez de exigir un token real.
    expect(cuerpo.confirmatPer).toEqual({ id: 0, nom: 'dev-sense-auth' });

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
});
