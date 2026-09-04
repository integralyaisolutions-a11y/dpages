import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import {
  clasificarCandidats,
  crearAlias,
  existeAlias,
  obtenirCandidats,
  reprocesarLinies,
} from './poblar-alies-comanda-linia.js';

/**
 * Capa 50 — esquema nuevo por test (no compartido): el script reprocesa
 * TODAS las líneas sin resolver de la base, así que dos tests no pueden
 * convivir en el mismo esquema sin que uno contamine el recuento del otro
 * (mismo criterio que reset-carga-inicial.test.ts).
 */
describe('poblar-alies-comanda-linia (Postgres real, esquema aislado por test)', () => {
  let esquema: string;
  let poolTest: Pool;

  beforeEach(async () => {
    esquema = `test_alies_${randomUUID().replaceAll('-', '_')}`;
    const setup = new Client({ connectionString: env.DATABASE_URL });
    await setup.connect();
    await setup.query(`CREATE SCHEMA "${esquema}"`);
    await setup.query(`SET search_path TO "${esquema}"`);
    await migrarArriba(setup);
    await setup.end();

    poolTest = new Pool({
      connectionString: env.DATABASE_URL,
      options: `-c search_path=${esquema}`,
    });
  });

  afterEach(async () => {
    await poolTest.end();
    const cleanup = new Client({ connectionString: env.DATABASE_URL });
    await cleanup.connect();
    await cleanup.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await cleanup.end();
  });

  /** Fixture mínima: un producte, una comanda con una línea sin resolver que trae woo_sku. */
  async function crearLiniaSenseResoldre(opts: {
    wooProductId: number;
    wooSku: string;
    origenId?: string;
  }): Promise<{ liniaId: string }> {
    const origen = await poolTest.query<{ id: string }>(
      `INSERT INTO origen_comanda (codi, nom) VALUES ('manual', 'Manual')
       ON CONFLICT (codi) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
    );
    const comanda = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda (num, origen_id) VALUES ($1, $2) RETURNING id`,
      [`CLI-${randomUUID().slice(0, 8)}`, origen.rows[0]!.id],
    );
    const linia = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda_linia
         (comanda_id, ordinal, producte_id, woo_product_id, woo_variation_id, woo_sku, unitats_demanades, preu_unitari, pes_calculat_kg)
       VALUES ($1, 0, NULL, $2, 0, $3, 2, 9.99, 0)
       RETURNING id`,
      [comanda.rows[0]!.id, opts.wooProductId, opts.wooSku],
    );
    return { liniaId: linia.rows[0]!.id };
  }

  async function crearProducte(codi: string, pesKg: string | null = null): Promise<string> {
    const res = await poolTest.query<{ id: string }>(
      `INSERT INTO producte (codi, descripcio, tipus, pes_kg) VALUES ($1, $2, 'simple', $3) RETURNING id`,
      [codi, `Article ${codi}`, pesKg],
    );
    return res.rows[0]!.id;
  }

  async function aterrizarProductoCrudo(
    wooProductId: number,
    categoriaName: string,
  ): Promise<void> {
    await poolTest.query(
      `INSERT INTO aterratge_woocommerce (recurs, woo_id, payload, capturat_en)
       VALUES ('products', $1, $2, now())`,
      [
        wooProductId,
        JSON.stringify({
          id: wooProductId,
          name: 'Producte de prova',
          sku: 'X',
          type: 'simple',
          status: 'publish',
          weight: '',
          date_modified_gmt: '2026-08-01T00:00:00',
          categories: [{ id: 1, name: categoriaName, slug: categoriaName.toLowerCase() }],
          attributes: [],
          meta_data: [],
        }),
      ],
    );
  }

  it('match EXACTO con idioma resoluble: clasifica, crea el alias y reprocesa la línea', async () => {
    const producteId = await crearProducte('SECALL01', '1.500');
    await aterrizarProductoCrudo(9001, 'Fresc'); // heurística -> idioma 'ca'
    const { liniaId } = await crearLiniaSenseResoldre({ wooProductId: 9001, wooSku: 'SECALL01' });

    const client = await poolTest.connect();
    try {
      const candidats = await obtenirCandidats(client);
      expect(candidats).toHaveLength(1);
      expect(candidats[0]).toMatchObject({ wooSku: 'SECALL01', liniesAfectades: 1 });

      const resultats = await clasificarCandidats(client, candidats);
      expect(resultats).toHaveLength(1);
      expect(resultats[0]).toMatchObject({
        tipus: 'exacte',
        idioma: 'ca',
        producte: { id: producteId, codi: 'SECALL01' },
      });

      await crearAlias(client, resultats[0]!);
      const resueltas = await reprocesarLinies(client, true, ['SECALL01']);
      expect(resueltas).toBe(1);
    } finally {
      client.release();
    }

    const alias = await poolTest.query(
      `SELECT producte_id, woo_product_id, woo_variation_id, idioma, codi FROM alias_producte`,
    );
    expect(alias.rows).toEqual([
      {
        producte_id: producteId,
        woo_product_id: '9001',
        woo_variation_id: '0',
        idioma: 'ca',
        codi: 'SECALL01',
      },
    ]);

    const linia = await poolTest.query<{
      producte_id: string | null;
      alias_producte_id: string | null;
      pes_fitxa_kg: string | null;
      pes_calculat_kg: string;
      pes_editable: boolean;
    }>(
      `SELECT producte_id, alias_producte_id, pes_fitxa_kg, pes_calculat_kg, pes_editable FROM comanda_linia WHERE id = $1`,
      [liniaId],
    );
    expect(linia.rows[0]?.producte_id).toBe(producteId);
    expect(linia.rows[0]?.alias_producte_id).not.toBeNull();
    expect(linia.rows[0]?.pes_fitxa_kg).toBe('1.500');
    expect(linia.rows[0]?.pes_calculat_kg).toBe('3.000'); // 2 unidades × 1.500
    expect(linia.rows[0]?.pes_editable).toBe(false);
  });

  it('match APROXIMADO (case/trim): se clasifica aparte, NO se aplica salvo que se pase explícitamente', async () => {
    // "PXCUR0102_paq 100 gr" en producte, "pxcur0102_paq 100 gr " (minúsculas)
    // llegando de WooCommerce — mismo tipo de diferencia real reportada.
    const producteId = await crearProducte('PXCUR0102_paq 100 gr');
    await aterrizarProductoCrudo(9002, 'Categoria desconeguda'); // cae al default 'ca'
    await crearLiniaSenseResoldre({ wooProductId: 9002, wooSku: 'pxcur0102_paq 100 gr' });

    const client = await poolTest.connect();
    try {
      const candidats = await obtenirCandidats(client);
      const resultats = await clasificarCandidats(client, candidats);

      expect(resultats).toHaveLength(1);
      expect(resultats[0]).toMatchObject({
        tipus: 'aproximat',
        producte: { id: producteId, codi: 'PXCUR0102_paq 100 gr' },
      });

      // Reprocesar SIN crear el alias primero: resolverArticle exige
      // igualdad EXACTA en su paso 3 — un match aproximado nunca resuelve solo.
      const resueltasSinAlias = await reprocesarLinies(client, false, ['pxcur0102_paq 100 gr']);
      expect(resueltasSinAlias).toBe(0);
    } finally {
      client.release();
    }
  });

  it('SIN producte en el catálogo: se reporta aparte, sin acción posible', async () => {
    await crearLiniaSenseResoldre({ wooProductId: 9003, wooSku: 'NO_EXISTE_EN_CATALEG' });

    const client = await poolTest.connect();
    try {
      const candidats = await obtenirCandidats(client);
      const resultats = await clasificarCandidats(client, candidats);
      expect(resultats).toEqual([
        expect.objectContaining({ tipus: 'sense_producte', producte: null, idioma: null }),
      ]);
    } finally {
      client.release();
    }
  });

  it('match exacto pero SIN dato crudo en aterratge_woocommerce: idioma null, no crea el alias ni con --aplicar', async () => {
    const producteId = await crearProducte('BOTNG01');
    // A propósito: nunca se aterriza el producto 9004 — simula el caso real
    // (producto nunca capturado por sync-cataleg).
    await crearLiniaSenseResoldre({ wooProductId: 9004, wooSku: 'BOTNG01' });

    const client = await poolTest.connect();
    try {
      const candidats = await obtenirCandidats(client);
      const resultats = await clasificarCandidats(client, candidats);

      expect(resultats[0]).toMatchObject({
        tipus: 'exacte',
        producte: { id: producteId, codi: 'BOTNG01' },
        idioma: null,
      });
      expect(resultats[0]?.motivoSenseIdioma).toMatch(/nunca se aterrizó/);

      // crearAlias comprueba r.idioma internamente — no crea nada sin idioma.
      await crearAlias(client, resultats[0]!);
    } finally {
      client.release();
    }

    const alias = await poolTest.query(`SELECT * FROM alias_producte`);
    expect(alias.rows).toHaveLength(0);
  });

  it('idempotente: correr crearAlias dos veces no duplica (UNIQUE de alias_producte)', async () => {
    await crearProducte('LOT01_POLLO');
    await aterrizarProductoCrudo(9005, 'Fresc');
    await crearLiniaSenseResoldre({ wooProductId: 9005, wooSku: 'LOT01_POLLO' });

    const client = await poolTest.connect();
    try {
      const candidats = await obtenirCandidats(client);
      const resultats = await clasificarCandidats(client, candidats);

      await crearAlias(client, resultats[0]!);
      expect(await existeAlias(client, 9005, 0)).toBe(true);
      await crearAlias(client, resultats[0]!); // segunda corrida — no debería fallar ni duplicar
    } finally {
      client.release();
    }

    const alias = await poolTest.query<{ count: string }>(`SELECT count(*) FROM alias_producte`);
    expect(Number(alias.rows[0]?.count)).toBe(1);
  });
});
