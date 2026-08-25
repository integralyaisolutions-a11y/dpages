import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import { backfillCodiClientsWoocommerce } from './backfill-codi-clients-woocommerce.js';

describe('backfillCodiClientsWoocommerce (Postgres real, esquema aislado por test)', () => {
  let esquema: string;
  let poolTest: Pool;

  beforeEach(async () => {
    esquema = `test_backfill_codi_${randomUUID().replaceAll('-', '_')}`;
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

  it('asigna CLI + id_seq (sin padding fijo) a un cliente sin codi (simula uno sincronizado antes de la capa 25)', async () => {
    const sincronitzat = await poolTest.query<{ id_seq: string }>(
      `INSERT INTO client (nom, email, woo_customer_id) VALUES ('Restaurant Vell', 'vell@example.com', 42) RETURNING id_seq`,
    );
    const idSeq = sincronitzat.rows[0]!.id_seq;

    const resultat = await backfillCodiClientsWoocommerce(poolTest);
    expect(resultat.actualitzats).toBe(1);

    const fila = await poolTest.query<{ codi: string | null }>(
      `SELECT codi FROM client WHERE id_seq = $1`,
      [idSeq],
    );
    expect(fila.rows[0]?.codi).toBe(`CLI${idSeq}`);
  });

  it('trata codi = "" (cadena vacía) igual que NULL', async () => {
    const buit = await poolTest.query<{ id_seq: string }>(
      `INSERT INTO client (nom, codi) VALUES ('Amb codi buit', '') RETURNING id_seq`,
    );

    const resultat = await backfillCodiClientsWoocommerce(poolTest);
    expect(resultat.actualitzats).toBe(1);

    const fila = await poolTest.query<{ codi: string | null }>(
      `SELECT codi FROM client WHERE id_seq = $1`,
      [buit.rows[0]!.id_seq],
    );
    expect(fila.rows[0]?.codi).toBe(`CLI${buit.rows[0]!.id_seq}`);
  });

  it('regresión: id_seq de 4+ cifras no trunca ni colisiona (bug real: 4916/4918 → mismo "CLI491" con padding fijo a 3 dígitos)', async () => {
    await poolTest.query('ALTER TABLE client ALTER COLUMN id_seq RESTART WITH 4916');
    await poolTest.query(
      `INSERT INTO client (nom, email) VALUES ('Client A', 'a@example.com'), ('Client B', 'b@example.com')`,
    );

    const resultat = await backfillCodiClientsWoocommerce(poolTest);
    expect(resultat.actualitzats).toBe(2);

    const files = await poolTest.query<{ id_seq: string; codi: string | null }>(
      `SELECT id_seq, codi FROM client ORDER BY id_seq ASC`,
    );
    expect(files.rows[0]).toEqual({ id_seq: '4916', codi: 'CLI4916' });
    expect(files.rows[1]).toEqual({ id_seq: '4917', codi: 'CLI4917' });
  });

  it('NO toca un cliente que ya tiene codi (alta manual, o ya backfilleado antes)', async () => {
    await poolTest.query(`INSERT INTO client (nom, codi) VALUES ('Client manual', 'CODI-MANUAL')`);

    const resultat = await backfillCodiClientsWoocommerce(poolTest);
    expect(resultat.actualitzats).toBe(0);

    const fila = await poolTest.query<{ codi: string | null }>(
      `SELECT codi FROM client WHERE nom = 'Client manual'`,
    );
    expect(fila.rows[0]?.codi).toBe('CODI-MANUAL'); // sin cambios
  });

  it('es seguro correr dos veces — la segunda corrida no actualiza nada más', async () => {
    await poolTest.query(
      `INSERT INTO client (nom, email) VALUES ('Cliente sync', 'sync@example.com')`,
    );

    const primera = await backfillCodiClientsWoocommerce(poolTest);
    expect(primera.actualitzats).toBe(1);

    const segona = await backfillCodiClientsWoocommerce(poolTest);
    expect(segona.actualitzats).toBe(0);
  });
});
