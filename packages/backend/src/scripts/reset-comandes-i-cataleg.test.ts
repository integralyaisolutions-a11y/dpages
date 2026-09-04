import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import { comptarFiles, esborrarTot, resetComandesICataleg } from './reset-comandes-i-cataleg.js';

const confirmarSi = (): Promise<boolean> => Promise.resolve(true);
const confirmarNo = (): Promise<boolean> => Promise.resolve(false);

/**
 * Capa 51, Parte 2 — esquema nuevo por test (no compartido): el borrado es
 * total sobre las 9 tablas, así que dos tests no pueden convivir en el
 * mismo esquema sin que uno contamine el recuento del otro (mismo criterio
 * que reset-carga-inicial.test.ts).
 */
describe('resetComandesICataleg (Postgres real, esquema aislado por test)', () => {
  let esquema: string;
  let poolTest: Pool;

  beforeEach(async () => {
    esquema = `test_reset_c_i_c_${randomUUID().replaceAll('-', '_')}`;
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

  /**
   * Fixture completa: una fila en cada una de las 9 tablas a borrar, MÁS
   * una fila en cada tabla que NO se debe tocar (client, tarifa,
   * transportista, usuari, rol, origen_comanda, aterratge_woocommerce,
   * esdeveniment_webhook) — para poder afirmar que sobreviven intactas.
   */
  async function crearFixtureCompleta(): Promise<void> {
    const categoria = await poolTest.query<{ id: string }>(
      `INSERT INTO categoria_producte (nom) VALUES ('Fresc') RETURNING id`,
    );
    const producte = await poolTest.query<{ id: string }>(
      `INSERT INTO producte (codi, descripcio, tipus, pes_kg, categoria_id)
       VALUES ('LLF01', 'Llom fresc de porc', 'simple', '1.250', $1) RETURNING id`,
      [categoria.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO alias_producte (producte_id, woo_product_id, woo_variation_id, idioma, codi)
       VALUES ($1, 100, 0, 'ca', 'LLF01')`,
      [producte.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO rendiments_porcs (producte_id, unitats_per_porc, kg_per_unitat)
       VALUES ($1, '2.00', '3.500')`,
      [producte.rows[0]!.id],
    );
    const tarifa = await poolTest.query<{ id: string }>(
      `INSERT INTO tarifa (nom) VALUES ('Tarifa de prova') RETURNING id`,
    );
    await poolTest.query(
      `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu) VALUES ($1, $2, '9.86')`,
      [tarifa.rows[0]!.id, producte.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO incidencia_cataleg (woo_product_id, tipus, detall)
       VALUES (999, 'article_sense_sku', 'Producte de prova sense SKU')`,
    );

    const origen = await poolTest.query<{ id: string }>(
      `INSERT INTO origen_comanda (codi, nom) VALUES ('manual', 'Manual') RETURNING id`,
    );
    const comanda = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda (num, origen_id) VALUES ('CLI-1', $1) RETURNING id`,
      [origen.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO comanda_linia
         (comanda_id, ordinal, producte_id, unitats_demanades, preu_unitari, pes_calculat_kg)
       VALUES ($1, 0, $2, 2, '9.86', '2.500')`,
      [comanda.rows[0]!.id, producte.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO incidencia_comanda (comanda_id, tipus, detall)
       VALUES ($1, 'sense_dades_client', 'Sense NIF ni email')`,
      [comanda.rows[0]!.id],
    );

    // Lo que NO se debe tocar.
    await poolTest.query(`INSERT INTO client (nom) VALUES ('Client que sobreviu')`);
    await poolTest.query(`INSERT INTO transportista (nom) VALUES ('DHL')`);
    await poolTest.query(
      `INSERT INTO aterratge_woocommerce (recurs, woo_id, payload)
       VALUES ('products', 100, '{"id": 100}'::jsonb)`,
    );
    await poolTest.query(
      `INSERT INTO esdeveniment_webhook (woo_order_id, topic, signatura_valida)
       VALUES (12345, 'order.updated', true)`,
    );
  }

  it('dry-run (aplicar=false): informa el conteo real, no borra nada', async () => {
    await crearFixtureCompleta();

    const resultat = await resetComandesICataleg(poolTest, false);

    expect(resultat.feta).toBe(false);
    if (resultat.feta) throw new Error('no debería haberse aplicado');
    expect(resultat.motiu).toBe('dry_run');
    expect(resultat.abans).toMatchObject({
      incidencia_comanda: 1,
      comanda_linia: 1,
      comanda: 1,
      alias_producte: 1,
      rendiments_porcs: 1,
      tarifa_preu: 1,
      producte: 1,
      categoria_producte: 1,
      incidencia_cataleg: 1,
    });

    // Nada se tocó — ni las tablas del reset ni las que sobreviven.
    const despres = await comptarFiles(poolTest);
    expect(despres).toEqual(resultat.abans);
    const client = await poolTest.query<{ count: string }>('SELECT count(*) FROM client');
    expect(Number(client.rows[0]?.count)).toBe(1);
  });

  it('res_per_esborrar: con las 9 tablas ya vacías, no pregunta nada y no hace nada', async () => {
    const resultat = await resetComandesICataleg(poolTest, true, confirmarSi);
    expect(resultat.feta).toBe(false);
    if (resultat.feta) throw new Error('no debería haberse aplicado');
    expect(resultat.motiu).toBe('res_per_esborrar');
  });

  it('cancellat: con --aplicar pero sin confirmar, no borra nada', async () => {
    await crearFixtureCompleta();

    const resultat = await resetComandesICataleg(poolTest, true, confirmarNo);
    expect(resultat.feta).toBe(false);
    if (resultat.feta) throw new Error('no debería haberse aplicado');
    expect(resultat.motiu).toBe('cancellat');

    const despres = await comptarFiles(poolTest);
    expect(despres.comanda).toBe(1);
    expect(despres.producte).toBe(1);
  });

  it('aplicar + confirmar: borra las 9 tablas por completo, en el orden correcto, sin violar ninguna FK', async () => {
    await crearFixtureCompleta();

    const resultat = await resetComandesICataleg(poolTest, true, confirmarSi);

    expect(resultat.feta).toBe(true);
    if (!resultat.feta) throw new Error('debería haberse aplicado');
    expect(resultat.recompte).toMatchObject({
      incidencia_comanda: 1,
      comanda_linia: 1,
      comanda: 1,
      alias_producte: 1,
      rendiments_porcs: 1,
      tarifa_preu: 1,
      producte: 1,
      categoria_producte: 1,
      incidencia_cataleg: 1,
    });

    const despres = await comptarFiles(poolTest);
    for (const valor of Object.values(despres)) {
      expect(valor).toBe(0);
    }
  });

  it('NO toca client, tarifa, transportista, aterratge_woocommerce ni esdeveniment_webhook', async () => {
    await crearFixtureCompleta();

    await resetComandesICataleg(poolTest, true, confirmarSi);

    const client = await poolTest.query<{ count: string }>('SELECT count(*) FROM client');
    expect(Number(client.rows[0]?.count)).toBe(1);
    const tarifa = await poolTest.query<{ count: string }>('SELECT count(*) FROM tarifa');
    expect(Number(tarifa.rows[0]?.count)).toBe(1);
    const transportista = await poolTest.query<{ count: string }>(
      'SELECT count(*) FROM transportista',
    );
    expect(Number(transportista.rows[0]?.count)).toBe(1);
    const aterratge = await poolTest.query<{ count: string }>(
      'SELECT count(*) FROM aterratge_woocommerce',
    );
    expect(Number(aterratge.rows[0]?.count)).toBe(1);
    const webhook = await poolTest.query<{ count: string }>(
      'SELECT count(*) FROM esdeveniment_webhook',
    );
    expect(Number(webhook.rows[0]?.count)).toBe(1);
  });

  it('esborrarTot es idempotente: correrlo de nuevo sobre tablas ya vacías no falla', async () => {
    await crearFixtureCompleta();
    await esborrarTot(poolTest);

    const recompte = await esborrarTot(poolTest);
    for (const valor of Object.values(recompte)) {
      expect(valor).toBe(0);
    }
  });
});
