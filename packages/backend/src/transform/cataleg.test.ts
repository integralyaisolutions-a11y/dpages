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

    const productes = await poolTest.query<{ id: string }>(
      `SELECT id FROM producte WHERE codi = 'LLF01'`,
    );
    expect(productes.rowCount).toBe(1);

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
  });

  it('un artículo sin código crea el producte con codi null, sin romper', async () => {
    await aterrizar(producteSenseSku);

    const resultado = await transformarCataleg(poolTest);
    expect(resultado.articlesCreats).toBe(1);

    const producte = await poolTest.query<{ codi: string | null }>(
      `SELECT p.codi FROM producte p
       JOIN alias_producte a ON a.producte_id = p.id
       WHERE a.woo_product_id = $1`,
      [producteSenseSku.id],
    );
    expect(producte.rows[0]?.codi).toBeNull();
  });
});
