import { randomUUID } from 'node:crypto';
import type { ComandaDetallApi, LliuramentDesferRespostaApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

/**
 * Issue #19 — PATCH .../lliurament/desfer. Mismo patrón de test que
 * lliurament.test.ts/treball.test.ts (mismo endpoint hermano, mismo guard
 * de congelación).
 */
describe('API negoci — PATCH .../lliurament/desfer (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let comandaId: number;
  let liniaId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('desfer-lliurament');
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
        dataComanda: '2026-08-01',
        dataLliurament: '2026-08-30T00:00:00Z',
        origen: 'manual',
        linies: [
          {
            dataProduccio: '2026-08-01T00:00:00Z',
            producteId: Number(producte.rows[0]!.id_seq),
            unitatsDemanades: 8,
          },
        ],
      },
    });
    const cos = cuerpoJson<ComandaDetallApi>(res);
    comandaId = cos.id;
    liniaId = cos.linies[0]!.id;
  }

  it('confirma i després desfà: confirmatA/confirmatPer tornen a null, unitats/kg queden intactes', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);

    await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament`,
      payload: { unitatsLliurades: 8, kgLliurats: '9.750' },
    });

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament/desfer`,
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<LliuramentDesferRespostaApi>(res);
    expect(cuerpo).toMatchObject({ liniaId, comandaId, confirmatA: null, confirmatPer: null });

    // Releído directo de la base — confirma que sólo se resetearon
    // confirmat_a/confirmat_per, unitats_lliurades/kg_lliurats no se tocan.
    const fila = await entorn.poolTest.query<{
      confirmat_a: Date | null;
      confirmat_per: string | null;
      unitats_lliurades: string;
      kg_lliurats: string;
    }>(
      `SELECT confirmat_a, confirmat_per, unitats_lliurades, kg_lliurats
       FROM comanda_linia WHERE id_seq = $1`,
      [liniaId],
    );
    expect(fila.rows[0]?.confirmat_a).toBeNull();
    expect(fila.rows[0]?.confirmat_per).toBeNull();
    expect(fila.rows[0]?.unitats_lliurades).toBe('8.00');
    expect(fila.rows[0]?.kg_lliurats).toBe('9.750');

    await fastify.close();
  });

  it('rebutja amb 409 CONFLICTE si la comanda està congelada', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);
    await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament`,
      payload: { unitatsLliurades: 8, kgLliurats: '9.750' },
    });
    await entorn.poolTest.query(`UPDATE comanda SET congelat_a = now() WHERE id_seq = $1`, [
      comandaId,
    ]);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/lliurament/desfer`,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

    await fastify.close();
  });

  it('línia inexistent dona 404 NO_TROBAT', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/999999/lliurament/desfer`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

    await fastify.close();
  });
});
