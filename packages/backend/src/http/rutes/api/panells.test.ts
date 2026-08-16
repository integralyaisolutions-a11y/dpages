import type { PanellEmpaquetatApi, PanellObradorApi, PanellOficinaApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /panells (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    entorn = await prepararEntornApi('panells');
    construirServidor = entorn.construirServidor;

    const producte = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, pes_kg, preu_venda, tipus)
       VALUES ('LLF01', 'Llom fresc de porc', '1.250', '9.86', 'simple') RETURNING id_seq`,
    );
    const producteId = Number(producte.rows[0]!.id_seq);

    const fastify = construirServidor();
    // 3 pedidos con la misma línea — más que la página (mida=2) para
    // verificar que `totals` cubre TODO lo filtrado, no sólo la página.
    for (let i = 0; i < 3; i++) {
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'telefon',
          linies: [{ producteId, unitatsDemanades: 2 }],
        },
      });
    }
    await fastify.close();
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /panells/oficina: totals cubre todo lo filtrado, no sólo la página visible', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/panells/oficina?mida=2' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<PanellOficinaApi>(res);
    expect(cuerpo.dades).toHaveLength(2); // página de 2
    expect(cuerpo.totals.comandes).toBe(3); // total real, no la página
    expect(cuerpo.totals.linies).toBe(3);
    expect(cuerpo.paginacio).toEqual({ pagina: 1, mida: 2, total: 3, totalPagines: 2 });

    await fastify.close();
  });

  it('GET /panells/obrador: agrupado por artículo, no por pedido', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/panells/obrador' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<PanellObradorApi>(res);
    // 3 pedidos × 2 unidades del mismo artículo = una sola fila agrupada con 6 unidades.
    expect(cuerpo.dades).toHaveLength(1);
    expect(cuerpo.dades[0]?.unitats).toBe(6);
    expect(cuerpo.dades[0]?.kg).toBe('7.500'); // 6 × 1.250
    expect(cuerpo.totals.totalUnitats).toBe(6);

    await fastify.close();
  });

  it('GET /panells/empaquetat: una fila por línea, con liniesPendents/Confirmades correctos', async () => {
    const fastify = construirServidor();
    const abans = cuerpoJson<PanellEmpaquetatApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/empaquetat' }),
    );
    expect(abans.totals.linies).toBe(3);
    expect(abans.totals.liniesConfirmades).toBe(0);
    expect(abans.totals.liniesPendents).toBe(3);

    const primeraLinia = abans.dades[0]!;
    await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${primeraLinia.comandaId}/linies/${primeraLinia.liniaId}/lliurament`,
      payload: { unitatsLliurades: 2, kgLliurats: '2.500' },
    });

    const despres = cuerpoJson<PanellEmpaquetatApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/empaquetat' }),
    );
    expect(despres.totals.liniesConfirmades).toBe(1);
    expect(despres.totals.liniesPendents).toBe(2);

    await fastify.close();
  });
});
