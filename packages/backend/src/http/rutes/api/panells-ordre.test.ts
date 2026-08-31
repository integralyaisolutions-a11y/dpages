import { randomUUID } from 'node:crypto';
import type { ComandaDetallApi, PanellEmpaquetatApi, PanellObradorApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

/**
 * Capa 46 — pendents primer, per defecte (sense cap paràmetre), a
 * GET /panells/obrador (pendent = treballat_a IS NULL) i
 * GET /panells/empaquetat (pendent = confirmat_a IS NULL). Esquema propi i
 * aïllat: no comparteix estat amb panells.test.ts, que assumeix totals
 * exactes entre tests i és sensible a l'ordre d'execució — cada test d'acà
 * filtra per un `producte` únic (descripció aleatòria) per no interferir
 * amb res més del mateix esquema.
 */
describe('API negoci — ordre pendents-primer per defecte a Obrador/Empaquetat (capa 46, Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    entorn = await prepararEntornApi('panells-ordre');
    construirServidor = entorn.construirServidor;
  });

  afterAll(() => netejarEntornApi(entorn));

  async function crearComandaAmbLinia(
    fastify: ReturnType<typeof construirServidor>,
    descripcio: string,
  ): Promise<{ comandaId: number; liniaId: number }> {
    const codi = `T46-${randomUUID().slice(0, 8)}`;
    // pes_kg informado: si no, el artículo es "a medida" y unitatsDemanades
    // ya no alcanza (POST /comandes exige kgDemanats > 0 explícito) — no es
    // lo que este test necesita probar.
    const producte = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, pes_kg, tipus) VALUES ($1, $2, '1.250', 'simple') RETURNING id_seq`,
      [codi, descripcio],
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
    return { comandaId: cos.id, liniaId: cos.linies[0]!.id };
  }

  it('GET /panells/obrador: la línia pendent surt primer, encara que es va inserir DESPRÉS i té data de producció MÉS TARDANA', async () => {
    const fastify = construirServidor();
    const descripcio = `Producte obrador ordre ${randomUUID().slice(0, 8)}`;

    // Treballada: inserida PRIMER, amb data de producció MÉS ANTIGA — un
    // ORDER BY ingenu per data la posaria primera si no s'apliqués el fix.
    const treballada = await crearComandaAmbLinia(fastify, descripcio);
    await entorn.poolTest.query(
      `UPDATE comanda_linia SET data_produccio = '2026-08-01T00:00:00Z' WHERE id_seq = $1`,
      [treballada.liniaId],
    );
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });
    await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${treballada.comandaId}/linies/${treballada.liniaId}/treball`,
      payload: { marcat: true },
    });

    // Pendent: inserida DESPRÉS, amb data de producció MÉS TARDANA.
    const pendent = await crearComandaAmbLinia(fastify, descripcio);
    await entorn.poolTest.query(
      `UPDATE comanda_linia SET data_produccio = '2026-08-15T00:00:00Z' WHERE id_seq = $1`,
      [pendent.liniaId],
    );

    const cuerpo = cuerpoJson<PanellObradorApi>(
      await fastify.inject({
        method: 'GET',
        url: `/api/v1/panells/obrador?${new URLSearchParams({ producte: descripcio }).toString()}`,
      }),
    );

    expect(cuerpo.dades).toHaveLength(2);
    // Pendent primer, SENSE demanar cap paràmetre especial.
    expect(cuerpo.dades[0]?.liniaId).toBe(pendent.liniaId);
    expect(cuerpo.dades[1]?.liniaId).toBe(treballada.liniaId);

    await fastify.close();
  });

  it("GET /panells/obrador: dins de cada grup (pendent/treballada) es manté l'ordre de data existent (regressió)", async () => {
    const fastify = construirServidor();
    const descripcio = `Producte obrador regressio ${randomUUID().slice(0, 8)}`;

    // Dues pendents, inserides en ordre invers al de la data — l'ordre final
    // ha de respectar la data, no l'ordre d'inserció.
    const pendentTard = await crearComandaAmbLinia(fastify, descripcio);
    await entorn.poolTest.query(
      `UPDATE comanda_linia SET data_produccio = '2026-08-20T00:00:00Z' WHERE id_seq = $1`,
      [pendentTard.liniaId],
    );
    const pendentAviat = await crearComandaAmbLinia(fastify, descripcio);
    await entorn.poolTest.query(
      `UPDATE comanda_linia SET data_produccio = '2026-08-10T00:00:00Z' WHERE id_seq = $1`,
      [pendentAviat.liniaId],
    );

    const cuerpo = cuerpoJson<PanellObradorApi>(
      await fastify.inject({
        method: 'GET',
        url: `/api/v1/panells/obrador?${new URLSearchParams({ producte: descripcio }).toString()}`,
      }),
    );

    expect(cuerpo.dades).toHaveLength(2);
    expect(cuerpo.dades[0]?.liniaId).toBe(pendentAviat.liniaId);
    expect(cuerpo.dades[1]?.liniaId).toBe(pendentTard.liniaId);

    await fastify.close();
  });

  it("GET /panells/empaquetat: la línia pendent surt primer, encara que es va inserir DESPRÉS i té data d'expedició MÉS TARDANA", async () => {
    const fastify = construirServidor();
    const descripcio = `Producte empaquetat ordre ${randomUUID().slice(0, 8)}`;

    const confirmada = await crearComandaAmbLinia(fastify, descripcio);
    await entorn.poolTest.query(
      `UPDATE comanda SET data_expedicio = '2026-08-01T00:00:00Z' WHERE id_seq = $1`,
      [confirmada.comandaId],
    );
    const respostaLliurament = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${confirmada.comandaId}/linies/${confirmada.liniaId}/lliurament`,
      payload: { unitatsLliurades: 1, kgLliurats: '1.250' },
    });
    expect(respostaLliurament.statusCode).toBe(200);

    const pendent = await crearComandaAmbLinia(fastify, descripcio);
    await entorn.poolTest.query(
      `UPDATE comanda SET data_expedicio = '2026-08-15T00:00:00Z' WHERE id_seq = $1`,
      [pendent.comandaId],
    );

    const cuerpo = cuerpoJson<PanellEmpaquetatApi>(
      await fastify.inject({
        method: 'GET',
        url: `/api/v1/panells/empaquetat?${new URLSearchParams({ producte: descripcio }).toString()}`,
      }),
    );

    expect(cuerpo.dades).toHaveLength(2);
    expect(cuerpo.dades[0]?.liniaId).toBe(pendent.liniaId);
    expect(cuerpo.dades[1]?.liniaId).toBe(confirmada.liniaId);

    await fastify.close();
  });

  it("GET /panells/empaquetat: dins de cada grup es manté l'ordre de data existent (regressió)", async () => {
    const fastify = construirServidor();
    const descripcio = `Producte empaquetat regressio ${randomUUID().slice(0, 8)}`;

    const pendentTard = await crearComandaAmbLinia(fastify, descripcio);
    await entorn.poolTest.query(
      `UPDATE comanda SET data_expedicio = '2026-08-20T00:00:00Z' WHERE id_seq = $1`,
      [pendentTard.comandaId],
    );
    const pendentAviat = await crearComandaAmbLinia(fastify, descripcio);
    await entorn.poolTest.query(
      `UPDATE comanda SET data_expedicio = '2026-08-10T00:00:00Z' WHERE id_seq = $1`,
      [pendentAviat.comandaId],
    );

    const cuerpo = cuerpoJson<PanellEmpaquetatApi>(
      await fastify.inject({
        method: 'GET',
        url: `/api/v1/panells/empaquetat?${new URLSearchParams({ producte: descripcio }).toString()}`,
      }),
    );

    expect(cuerpo.dades).toHaveLength(2);
    expect(cuerpo.dades[0]?.liniaId).toBe(pendentAviat.liniaId);
    expect(cuerpo.dades[1]?.liniaId).toBe(pendentTard.liniaId);

    await fastify.close();
  });
});
