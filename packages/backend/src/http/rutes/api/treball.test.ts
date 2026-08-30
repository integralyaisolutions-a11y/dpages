import { randomUUID } from 'node:crypto';
import type { ComandaDetallApi, PanellObradorApi, TreballLiniaRespostaApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

/**
 * Capa 40 — PATCH /comandes/:comandaId/linies/:liniaId/treball. Mismo
 * patrón de test que lliurament.test.ts (mismo endpoint hermano, mismo
 * guard de congelación).
 */
describe('API negoci — PATCH .../treball (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let comandaId: number;
  let liniaId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('treball');
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
        linies: [{ producteId: Number(producte.rows[0]!.id_seq), unitatsDemanades: 1 }],
      },
    });
    const cos = cuerpoJson<ComandaDetallApi>(res);
    comandaId = cos.id;
    liniaId = cos.linies[0]!.id;
  }

  it('marcat=true: treballatA/treballatPer queden poblats, rellegits de la base (no ecoats del body)', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);
    // Dispara el auto-provisioning de l'usuari de test — treballatPer
    // s'ha de resoldre contra la fila real de `usuari`.
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/treball`,
      payload: { marcat: true },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<TreballLiniaRespostaApi>(res);
    expect(cuerpo.liniaId).toBe(liniaId);
    expect(cuerpo.comandaId).toBe(comandaId);
    expect(cuerpo.treballatA).toMatch(/Z$/);
    expect(cuerpo.treballatPer?.nom).toBe('dev-sense-auth@dpages.local');

    // Releído directo de la base — el endpoint no debería estar ecoando
    // valores calculados en memoria sin haberlos guardado de verdad.
    const fila = await entorn.poolTest.query<{
      treballat_a: Date | null;
      treballat_per: string | null;
    }>(`SELECT treballat_a, treballat_per FROM comanda_linia WHERE id_seq = $1`, [liniaId]);
    expect(fila.rows[0]?.treballat_a).not.toBeNull();
    expect(fila.rows[0]?.treballat_per).not.toBeNull();

    await fastify.close();
  });

  it('marcat=false: desmarca — treballatA/treballatPer vuelven a null', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });
    await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/treball`,
      payload: { marcat: true },
    });

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/treball`,
      payload: { marcat: false },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<TreballLiniaRespostaApi>(res);
    expect(cuerpo.treballatA).toBeNull();
    expect(cuerpo.treballatPer).toBeNull();

    const fila = await entorn.poolTest.query<{
      treballat_a: Date | null;
      treballat_per: string | null;
    }>(`SELECT treballat_a, treballat_per FROM comanda_linia WHERE id_seq = $1`, [liniaId]);
    expect(fila.rows[0]?.treballat_a).toBeNull();
    expect(fila.rows[0]?.treballat_per).toBeNull();

    await fastify.close();
  });

  it('marcat invàlid (no booleà) dona 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/treball`,
      payload: { marcat: 'sí' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('rebutja amb 409 CONFLICTE si la comanda està congelada', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);
    await entorn.poolTest.query(`UPDATE comanda SET congelat_a = now() WHERE id_seq = $1`, [
      comandaId,
    ]);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/treball`,
      payload: { marcat: true },
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
      url: `/api/v1/comandes/${comandaId}/linies/999999/treball`,
      payload: { marcat: true },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

    await fastify.close();
  });

  it('GET /panells/obrador exposa treballatA/treballatPer per línia', async () => {
    const fastify = construirServidor();
    await crearComandaAmbLinia(fastify);
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });
    await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}/treball`,
      payload: { marcat: true },
    });

    const cuerpo = cuerpoJson<PanellObradorApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/obrador?mida=200' }),
    );
    const fila = cuerpo.dades.find((f) => f.liniaId === liniaId);
    expect(fila?.treballatA).toMatch(/Z$/);
    expect(fila?.treballatPer?.nom).toBe('dev-sense-auth@dpages.local');

    await fastify.close();
  });
});
