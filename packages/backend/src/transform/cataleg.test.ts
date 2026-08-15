import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WooProduct } from '@dpages/shared';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import { transformarCataleg } from './cataleg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function leerFixture<T>(nombre: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, '../__fixtures__', nombre), 'utf8')) as T;
}

const producteCa = leerFixture<WooProduct>('producte-ca.json'); // Llom, LLF01
const producteEs = leerFixture<WooProduct>('producte-es.json'); // Lomo, mismo SKU LLF01
const producteSenseSku = leerFixture<WooProduct>('producte-sense-sku.json'); // Botifarra blanca, sin código

describe('transformarCataleg (Postgres real, esquema aislado)', () => {
  const esquema = `test_cataleg_${randomUUID().replaceAll('-', '_')}`;
  let poolTest: Pool;

  async function aterrizar(producto: WooProduct): Promise<void> {
    await poolTest.query(
      `INSERT INTO aterratge_woocommerce (recurs, woo_id, payload) VALUES ('products', $1, $2)
       ON CONFLICT (recurs, woo_id) DO UPDATE SET payload = EXCLUDED.payload`,
      [producto.id, JSON.stringify(producto)],
    );
  }

  beforeAll(async () => {
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

  afterAll(async () => {
    await poolTest.end();
    const cleanup = new Client({ connectionString: env.DATABASE_URL });
    await cleanup.connect();
    await cleanup.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await cleanup.end();
  });

  it('la duplicación de idioma: dos productos con el mismo SKU generan UN producte y DOS alias', async () => {
    await aterrizar(producteCa);
    await aterrizar(producteEs);

    const resultado = await transformarCataleg(poolTest);
    expect(resultado.articlesCreats).toBe(1);
    expect(resultado.aliasCreats).toBe(2);
    expect(resultado.categoriesCreades).toBe(1); // Fresc/Fresco -> UNA categoría

    const productes = await poolTest.query<{ id: string; categoria_id: string | null }>(
      `SELECT id, categoria_id FROM producte WHERE codi = 'LLF01'`,
    );
    expect(productes.rowCount).toBe(1);
    expect(productes.rows[0]?.categoria_id).not.toBeNull();

    const categoria = await poolTest.query<{ nom: string }>(
      `SELECT nom FROM categoria_producte WHERE id = $1`,
      [productes.rows[0]?.categoria_id],
    );
    // El fixture ca trae "Fresc", el es trae "Fresco" — el nombre canónico
    // guardado es siempre el catalán, sin importar cuál se procesó primero.
    expect(categoria.rows[0]?.nom).toBe('Fresc');

    // woo_product_id es BIGINT: pg lo devuelve como string, no como number.
    const alias = await poolTest.query<{ idioma: string; woo_product_id: string }>(
      `SELECT idioma, woo_product_id FROM alias_producte WHERE producte_id = $1 ORDER BY idioma`,
      [productes.rows[0]?.id],
    );
    expect(alias.rows).toEqual([
      { idioma: 'ca', woo_product_id: String(producteCa.id) },
      { idioma: 'es', woo_product_id: String(producteEs.id) },
    ]);
  });

  it('correrlo de nuevo no duplica nada (idempotente)', async () => {
    const resultado = await transformarCataleg(poolTest);
    expect(resultado.articlesCreats).toBe(0);
    expect(resultado.aliasCreats).toBe(0);
    expect(resultado.categoriesCreades).toBe(0);
  });

  it('un artículo sin código NO crea producte — se registra como incidencia de catálogo (ADR-018)', async () => {
    await aterrizar(producteSenseSku);

    const resultado = await transformarCataleg(poolTest);
    expect(resultado.articlesCreats).toBe(0);
    expect(resultado.aliasCreats).toBe(0);
    expect(resultado.productesSenseSku).toBe(1);

    const alias = await poolTest.query(`SELECT 1 FROM alias_producte WHERE woo_product_id = $1`, [
      producteSenseSku.id,
    ]);
    expect(alias.rowCount).toBe(0);

    const incidencia = await poolTest.query<{ tipus: string; resolta: boolean }>(
      `SELECT tipus, resolta FROM incidencia_cataleg WHERE woo_product_id = $1`,
      [producteSenseSku.id],
    );
    expect(incidencia.rows[0]?.tipus).toBe('article_sense_sku');
    expect(incidencia.rows[0]?.resolta).toBe(false);
  });

  it('correr de nuevo un producto sin SKU no acumula una incidencia nueva por corrida', async () => {
    const resultado = await transformarCataleg(poolTest);
    expect(resultado.productesSenseSku).toBe(0); // ya tenía incidencia sin resolver — se saltea

    const incidencias = await poolTest.query(
      `SELECT id FROM incidencia_cataleg WHERE woo_product_id = $1`,
      [producteSenseSku.id],
    );
    expect(incidencias.rowCount).toBe(1);
  });

  it('DOS productos distintos sin SKU: ningún producte con codi vacío, ambos quedan como incidencia', async () => {
    const esquema2 = `test_cataleg_dos_sense_sku_${randomUUID().replaceAll('-', '_')}`;
    const setup = new Client({ connectionString: env.DATABASE_URL });
    await setup.connect();
    await setup.query(`CREATE SCHEMA "${esquema2}"`);
    await setup.query(`SET search_path TO "${esquema2}"`);
    await migrarArriba(setup);
    await setup.end();

    const poolTest2 = new Pool({
      connectionString: env.DATABASE_URL,
      options: `-c search_path=${esquema2}`,
    });

    try {
      const productoB: WooProduct = { ...producteSenseSku, id: producteSenseSku.id + 1, sku: '' };

      await poolTest2.query(
        `INSERT INTO aterratge_woocommerce (recurs, woo_id, payload) VALUES ('products', $1, $2)`,
        [producteSenseSku.id, JSON.stringify(producteSenseSku)],
      );
      await poolTest2.query(
        `INSERT INTO aterratge_woocommerce (recurs, woo_id, payload) VALUES ('products', $1, $2)`,
        [productoB.id, JSON.stringify(productoB)],
      );

      const resultado = await transformarCataleg(poolTest2);
      expect(resultado.articlesCreats).toBe(0);
      expect(resultado.aliasCreats).toBe(0);
      expect(resultado.productesSenseSku).toBe(2);

      const productesConCodiNulo = await poolTest2.query(
        `SELECT id FROM producte WHERE codi IS NULL OR codi = ''`,
      );
      expect(productesConCodiNulo.rowCount).toBe(0);

      const incidencias = await poolTest2.query<{ woo_product_id: string }>(
        `SELECT woo_product_id FROM incidencia_cataleg WHERE NOT resolta ORDER BY woo_product_id`,
      );
      expect(incidencias.rows.map((r) => Number(r.woo_product_id))).toEqual(
        [producteSenseSku.id, productoB.id].sort((a, b) => a - b),
      );
    } finally {
      await poolTest2.end();
      const cleanup = new Client({ connectionString: env.DATABASE_URL });
      await cleanup.connect();
      await cleanup.query(`DROP SCHEMA IF EXISTS "${esquema2}" CASCADE`);
      await cleanup.end();
    }
  });
});
