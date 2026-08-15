import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WooOrder } from '@dpages/shared';
import { Client, Pool } from 'pg';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import { transformarComanda } from './comandes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function leerFixture<T>(nombre: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, '../__fixtures__', nombre), 'utf8')) as T;
}

const comandaSimple = leerFixture<WooOrder>('comanda-simple.json'); // 1 línea, SKU LLF01, cantidad 1
const comandaMultilinia = leerFixture<WooOrder>('comanda-multilinia.json'); // 3 líneas: LLF01 x2 (ca), LLF01 x1 (es), BOT01 x3 (variación)

describe('transformarComanda (Postgres real, esquema aislado)', () => {
  const esquema = `test_comandes_${randomUUID().replaceAll('-', '_')}`;
  let poolTest: Pool;
  let producteLlomId: string;

  beforeAll(async () => {
    const setup = new Client({ connectionString: env.DATABASE_URL });
    await setup.connect();
    await setup.query(`CREATE SCHEMA "${esquema}"`);
    await setup.query(`SET search_path TO "${esquema}"`);
    await migrarArriba(setup);

    // Artículo con peso de ficha, y su alias — para que la línea LLF01 resuelva
    // con kgDemanats calculado (peso conocido, no "a medida").
    const producte = await setup.query<{ id: string }>(
      `INSERT INTO producte (codi, nom, pes_kg) VALUES ('LLF01', 'Llom', '1.250') RETURNING id`,
    );
    producteLlomId = producte.rows[0]!.id;
    await setup.query(
      `INSERT INTO alias_producte (producte_id, woo_product_id, woo_variation_id, idioma, codi)
       VALUES ($1, 6245, 0, 'ca', 'LLF01')`,
      [producteLlomId],
    );

    await setup.end();
    poolTest = new Pool({
      connectionString: env.DATABASE_URL,
      options: `-c search_path=${esquema}`,
    });
  });

  afterAll(async () => {
    await poolTest.end();
    const cleanup = new Client({ connectionString: env.DATABASE_URL });
    await cleanup.connect();
    await cleanup.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await cleanup.end();
  });

  async function conClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await poolTest.connect();
    try {
      await client.query('BEGIN');
      const resultado = await fn(client);
      await client.query('COMMIT');
      return resultado;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  it('crea una comanda nueva con la cabecera y kgDemanats calculado con el peso de ficha', async () => {
    const resultado = await conClient((client) => transformarComanda(client, comandaSimple));

    expect(resultado.actualitzada).toBe(true);
    expect(resultado.liniesNoResoltes).toBe(0);

    const comanda = await poolTest.query(
      `SELECT estat, estat_web, poblacio_desti, total FROM comanda WHERE id = $1`,
      [resultado.comandaId],
    );
    expect(comanda.rows[0]).toEqual({
      estat: 'oberta',
      estat_web: comandaSimple.status,
      poblacio_desti: comandaSimple.shipping.city,
      total: comandaSimple.total,
    });

    const linia = await poolTest.query(
      `SELECT producte_id, unitats_demanades, pes_fitxa_kg, pes_calculat_kg, pes_editable
       FROM comanda_linia WHERE comanda_id = $1`,
      [resultado.comandaId],
    );
    expect(linia.rows[0]).toEqual({
      producte_id: producteLlomId,
      unitats_demanades: 1,
      pes_fitxa_kg: '1.250',
      pes_calculat_kg: '1.250',
      pes_editable: false,
    });
  });

  it('línea sin artículo resuelto: se guarda con producte_id nulo y la comanda queda con incidencia', async () => {
    const resultado = await conClient((client) => transformarComanda(client, comandaMultilinia));

    // La 3ª línea (BOT01, variación 6415) no tiene ningún alias ni producte cargado.
    expect(resultado.liniesNoResoltes).toBe(1);

    const comanda = await poolTest.query<{ estat: string }>(
      `SELECT estat FROM comanda WHERE id = $1`,
      [resultado.comandaId],
    );
    expect(comanda.rows[0]?.estat).toBe('amb_incidencia');

    const incidencies = await poolTest.query<{ tipus: string }>(
      `SELECT tipus FROM incidencia_comanda WHERE comanda_id = $1`,
      [resultado.comandaId],
    );
    expect(incidencies.rows.map((r) => r.tipus)).toContain('article_no_resolt');

    const liniaNoResolta = await poolTest.query(
      `SELECT producte_id, woo_sku, pes_calculat_kg, pes_editable FROM comanda_linia
       WHERE comanda_id = $1 AND woo_sku = 'BOT01'`,
      [resultado.comandaId],
    );
    expect(liniaNoResolta.rows[0]).toEqual({
      producte_id: null,
      woo_sku: 'BOT01',
      pes_calculat_kg: '0.000',
      pes_editable: true,
    });
  });

  it('guardián de versión: una versión no más nueva no toca nada', async () => {
    const primeraVez = await conClient((client) => transformarComanda(client, comandaSimple));

    const antes = await poolTest.query(`SELECT total FROM comanda WHERE id = $1`, [
      primeraVez.comandaId,
    ]);

    // Misma fecha (o más vieja): el guardián de versión descarta.
    const resultado = await conClient((client) => transformarComanda(client, comandaSimple));
    expect(resultado.actualitzada).toBe(false);
    expect(resultado.congelada).toBe(false);

    const despues = await poolTest.query(`SELECT total FROM comanda WHERE id = $1`, [
      primeraVez.comandaId,
    ]);
    expect(despues.rows[0]).toEqual(antes.rows[0]);
  });

  it('propiedad de columnas: los campos operativos sobreviven a una actualización del sync', async () => {
    // Comanda "desde cero", ya en producción, con datos operativos reales
    // cargados por oficina/obrador/empaquetado — nada de esto vino de Woo.
    const transportista = await poolTest.query<{ id: string }>(
      `INSERT INTO transportista (nom) VALUES ('DHL') RETURNING id`,
    );
    const comanda = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda (
         woo_order_id, origen, estat, estat_web, poblacio_desti, total, data_modificacio_woo,
         data_produccio, data_expedicio, data_entrega, transportista_id, observacions
       ) VALUES (
         777001, 'web', 'en_proces', 'processing', 'Manresa', '10.00', '2026-01-01T00:00:00Z',
         '2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z', '2026-01-07T00:00:00Z', $1, 'Tallar més gruixut'
       ) RETURNING id`,
      [transportista.rows[0]?.id],
    );
    const comandaId = comanda.rows[0]!.id;

    const linia = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda_linia (
         comanda_id, ordinal, woo_line_item_id, producte_id,
         unitats_demanades, preu_unitari, pes_calculat_kg,
         unitats_lliurades, kg_lliurats, confirmat_a, confirmat_per
       ) VALUES ($1, 0, 555001, $2, 1, '8.00', '1.250', 1, '1.250', '2026-01-08T09:00:00Z', 'firebase-uid-empaquetat')
       RETURNING id`,
      [comandaId, producteLlomId],
    );

    const wooOrderActualizado: WooOrder = {
      ...comandaSimple,
      id: 777001,
      status: 'completed', // esto SÍ debería actualizarse (estat_web es del sync)
      date_modified_gmt: '2026-08-15T10:00:00', // más nueva que 2026-01-01
      line_items: [{ ...comandaSimple.line_items[0]!, id: 555001 }],
    };

    const resultado = await conClient((client) => transformarComanda(client, wooOrderActualizado));
    expect(resultado.actualitzada).toBe(true);

    const comandaDespues = await poolTest.query<{
      estat_web: string | null;
      data_produccio: Date | null;
      data_expedicio: Date | null;
      data_entrega: Date | null;
      transportista_id: string | null;
      observacions: string | null;
    }>(
      `SELECT estat_web, data_produccio, data_expedicio, data_entrega, transportista_id, observacions
       FROM comanda WHERE id = $1`,
      [comandaId],
    );
    expect(comandaDespues.rows[0]?.estat_web).toBe('completed'); // sync-owned: sí cambió
    expect(comandaDespues.rows[0]?.data_produccio?.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(comandaDespues.rows[0]?.data_expedicio?.toISOString()).toBe('2026-01-06T00:00:00.000Z');
    expect(comandaDespues.rows[0]?.data_entrega?.toISOString()).toBe('2026-01-07T00:00:00.000Z');
    expect(comandaDespues.rows[0]?.transportista_id).toBe(transportista.rows[0]?.id);
    expect(comandaDespues.rows[0]?.observacions).toBe('Tallar més gruixut');

    const liniaDespues = await poolTest.query<{
      unitats_lliurades: number;
      kg_lliurats: string;
      confirmat_a: Date | null;
      confirmat_per: string | null;
      unitats_demanades: number;
    }>(
      `SELECT unitats_lliurades, kg_lliurats, confirmat_a, confirmat_per, unitats_demanades
       FROM comanda_linia WHERE id = $1`,
      [linia.rows[0]?.id],
    );
    // Propiedad del sistema: intactos.
    expect(liniaDespues.rows[0]?.unitats_lliurades).toBe(1);
    expect(liniaDespues.rows[0]?.kg_lliurats).toBe('1.250');
    expect(liniaDespues.rows[0]?.confirmat_a?.toISOString()).toBe('2026-01-08T09:00:00.000Z');
    expect(liniaDespues.rows[0]?.confirmat_per).toBe('firebase-uid-empaquetat');
    // Propiedad de WooCommerce: si hubiera cambiado, esto sí se actualiza (no cambió en este caso).
    expect(liniaDespues.rows[0]?.unitats_demanades).toBe(1);
  });

  it('regla de congelación: no toca cabecera ni líneas, registra incidencia', async () => {
    const primeraVez = await conClient((client) => transformarComanda(client, comandaSimple));
    await poolTest.query(`UPDATE comanda SET congelat_a = now() WHERE id = $1`, [
      primeraVez.comandaId,
    ]);

    const antes = await poolTest.query<{ total: string; estat_web: string | null }>(
      `SELECT total, estat_web FROM comanda WHERE id = $1`,
      [primeraVez.comandaId],
    );

    const wooOrderActualizado: WooOrder = {
      ...comandaSimple,
      total: '999.99',
      status: 'cancelled',
      date_modified_gmt: '2026-09-01T00:00:00',
    };
    const resultado = await conClient((client) => transformarComanda(client, wooOrderActualizado));

    expect(resultado.congelada).toBe(true);

    const despues = await poolTest.query<{
      total: string;
      estat_web: string | null;
      estat: string;
    }>(`SELECT total, estat_web, estat FROM comanda WHERE id = $1`, [primeraVez.comandaId]);
    expect(despues.rows[0]?.total).toBe(antes.rows[0]?.total);
    expect(despues.rows[0]?.estat_web).toBe(antes.rows[0]?.estat_web);
    expect(despues.rows[0]?.estat).toBe('amb_incidencia');

    const incidencies = await poolTest.query<{ tipus: string }>(
      `SELECT tipus FROM incidencia_comanda WHERE comanda_id = $1`,
      [primeraVez.comandaId],
    );
    expect(incidencies.rows.map((r) => r.tipus)).toContain('actualitzacio_sobre_congelada');
  });

  it('emparejamiento por (producte, ordinal) cuando woo_line_item_id cambió, y esborrat para las que ya no vienen', async () => {
    const wooOrderId = 777002;
    const v1: WooOrder = {
      ...comandaSimple,
      id: wooOrderId,
      date_modified_gmt: '2026-02-01T00:00:00',
      line_items: [
        { ...comandaSimple.line_items[0]!, id: 111, quantity: 2 },
        { ...comandaSimple.line_items[0]!, id: 112, quantity: 5 },
      ],
    };
    const primeraVez = await conClient((client) => transformarComanda(client, v1));

    const liniasV1 = await poolTest.query<{
      id: string;
      ordinal: number;
      woo_line_item_id: number;
    }>(
      `SELECT id, ordinal, woo_line_item_id FROM comanda_linia WHERE comanda_id = $1 ORDER BY ordinal`,
      [primeraVez.comandaId],
    );
    const idLineaOrdinal0 = liniasV1.rows[0]!.id;

    // WooCommerce "editó" el pedido: recreó los line_item_id (admin), pero el
    // primer artículo/ordinal sigue siendo el mismo — y se borró la segunda línea.
    const v2: WooOrder = {
      ...comandaSimple,
      id: wooOrderId,
      date_modified_gmt: '2026-02-02T00:00:00',
      line_items: [{ ...comandaSimple.line_items[0]!, id: 999, quantity: 2 }],
    };
    await conClient((client) => transformarComanda(client, v2));

    // woo_line_item_id es BIGINT: pg lo devuelve como string, no como number.
    const liniasV2 = await poolTest.query<{
      id: string;
      woo_line_item_id: string;
      esborrat: boolean;
    }>(
      `SELECT id, woo_line_item_id, esborrat FROM comanda_linia WHERE comanda_id = $1 ORDER BY ordinal`,
      [primeraVez.comandaId],
    );

    // Se actualizó la MISMA fila (mismo id), no se creó una nueva.
    expect(liniasV2.rows[0]?.id).toBe(idLineaOrdinal0);
    expect(liniasV2.rows[0]?.woo_line_item_id).toBe('999');
    expect(liniasV2.rows[0]?.esborrat).toBe(false);

    // La segunda línea (ordinal 1) ya no vino: esborrat, no eliminada.
    expect(liniasV2.rows).toHaveLength(2);
    expect(liniasV2.rows[1]?.esborrat).toBe(true);
  });
});
