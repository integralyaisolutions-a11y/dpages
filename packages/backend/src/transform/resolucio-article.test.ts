import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import { resolverArticle } from './resolucio-article.js';

describe('resolverArticle (Postgres real, esquema aislado)', () => {
  const esquema = `test_resolucio_${randomUUID().replaceAll('-', '_')}`;
  const client = new Client({ connectionString: env.DATABASE_URL });

  let producteId: string;
  let aliasCaId: string;

  beforeAll(async () => {
    await client.connect();
    await client.query(`CREATE SCHEMA "${esquema}"`);
    await client.query(`SET search_path TO "${esquema}"`);
    await migrarArriba(client);

    const producte = await client.query<{ id: string }>(
      `INSERT INTO producte (codi, nom) VALUES ('LLF01', 'Llom') RETURNING id`,
    );
    producteId = producte.rows[0]!.id;

    const aliasCa = await client.query<{ id: string }>(
      `INSERT INTO alias_producte (producte_id, woo_product_id, woo_variation_id, idioma, codi)
       VALUES ($1, 6245, 0, 'ca', 'LLF01') RETURNING id`,
      [producteId],
    );
    aliasCaId = aliasCa.rows[0]!.id;

    // Alias de una variación concreta de OTRO producto, para el paso 2.
    await client.query(`INSERT INTO producte (codi, nom) VALUES ('BOT01', 'Botifarra')`);
    await client.query(
      `INSERT INTO alias_producte (producte_id, woo_product_id, woo_variation_id, idioma, codi)
       VALUES ((SELECT id FROM producte WHERE codi = 'BOT01'), 6410, 0, 'ca', 'BOT01')`,
    );
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await client.end();
  });

  it('paso 1: resuelve por (woo_product_id, woo_variation_id) exacto', async () => {
    const resultado = await resolverArticle(client, 6245, 0, null);
    expect(resultado).toEqual({ producteId, aliasProducteId: aliasCaId });
  });

  it('paso 2: si no hay alias para la variación exacta, cae al alias del producto padre (variación 0)', async () => {
    // 6410 con variation_id 9999 no tiene alias propio, pero el producto (0) sí.
    const resultado = await resolverArticle(client, 6410, 9999, null);
    expect(resultado?.producteId).toBeTruthy();
    const producte = await client.query<{ codi: string | null }>(
      `SELECT codi FROM producte WHERE id = $1`,
      [resultado?.producteId],
    );
    expect(producte.rows[0]?.codi).toBe('BOT01');
  });

  it('paso 3: si no hay ningún alias, resuelve por código de artículo (SKU de la línea)', async () => {
    const resultado = await resolverArticle(client, 99999999, 0, 'LLF01');
    expect(resultado).toEqual({ producteId, aliasProducteId: null });
  });

  it('paso 4: sin alias ni SKU coincidente, no resuelve (null) — no lanza', async () => {
    const resultado = await resolverArticle(client, 99999999, 0, 'CODIGO-INEXISTENTE');
    expect(resultado).toBeNull();
  });

  it('paso 4: SKU vacío tampoco resuelve por código (no se confunde con "sin filtro")', async () => {
    const resultado = await resolverArticle(client, 99999999, 0, '');
    expect(resultado).toBeNull();
  });
});
