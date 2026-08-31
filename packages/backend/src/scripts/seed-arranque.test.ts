import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import { sembrarOrigensComanda } from './seed-arranque.js';

/**
 * Mismo patrón que reset-carga-inicial.test.ts: esquema nuevo por test,
 * la función de seed se ejercita directo contra un PoolClient, sin pasar
 * por el script completo (que abre su propia conexión vía main()).
 */
describe('sembrarOrigensComanda (Postgres real, esquema aislado)', () => {
  let esquema: string;
  let poolTest: Pool;

  beforeEach(async () => {
    esquema = `test_seed_origens_${randomUUID().replaceAll('-', '_')}`;
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

  it('corrido dos veces deja exactamente 5 files, sense duplicar (capa 43)', async () => {
    const client = await poolTest.connect();
    try {
      await sembrarOrigensComanda(client);
      await sembrarOrigensComanda(client);
    } finally {
      client.release();
    }

    const files = await poolTest.query<{ codi: string }>(
      'SELECT codi FROM origen_comanda ORDER BY codi ASC',
    );
    expect(files.rows.map((f) => f.codi)).toEqual([
      'correu',
      'manual',
      'telefon',
      'whatsapp',
      'woocommerce',
    ]);
  });

  it('una comanda existent amb origen_id → manual segueix resolent igual després del seed', async () => {
    const clientA = await poolTest.connect();
    try {
      await sembrarOrigensComanda(clientA);
    } finally {
      clientA.release();
    }

    const origenManual = await poolTest.query<{ id: string }>(
      `SELECT id FROM origen_comanda WHERE codi = 'manual'`,
    );
    const comanda = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda (num, origen_id) VALUES ('CLI-1', $1) RETURNING id`,
      [origenManual.rows[0]!.id],
    );

    // Re-correr el seed (idempotent) no ha de tocar la fila 'manual' ni
    // trencar la referència de la comanda ja creada.
    const clientB = await poolTest.connect();
    try {
      await sembrarOrigensComanda(clientB);
    } finally {
      clientB.release();
    }

    const resultat = await poolTest.query<{ codi: string }>(
      `SELECT oc.codi FROM comanda c
       JOIN origen_comanda oc ON oc.id = c.origen_id
       WHERE c.id = $1`,
      [comanda.rows[0]!.id],
    );
    expect(resultat.rows[0]?.codi).toBe('manual');
  });
});
