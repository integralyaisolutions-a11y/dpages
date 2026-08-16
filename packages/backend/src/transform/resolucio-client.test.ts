import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WooOrder } from '@dpages/shared';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import { resolverOCrearClient } from './resolucio-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function leerFixture<T>(nombre: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, '../__fixtures__', nombre), 'utf8')) as T;
}

const comandaSimple = leerFixture<WooOrder>('comanda-simple.json'); // NIF por meta_data 'nif', billing.email presente
const comandaMultilinia = leerFixture<WooOrder>('comanda-multilinia.json'); // NIF distinto por '_billing_myfield5', invitado

describe('resolverOCrearClient (Postgres real, esquema aislado)', () => {
  const esquema = `test_resolucio_client_${randomUUID().replaceAll('-', '_')}`;
  const client = new Client({ connectionString: env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await client.query(`CREATE SCHEMA "${esquema}"`);
    await client.query(`SET search_path TO "${esquema}"`);
    await migrarArriba(client);
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await client.end();
  });

  it('con NIF nuevo (meta_data "nif"): crea exactamente un cliente y devuelve su id', async () => {
    await client.query('BEGIN');
    const clientId = await resolverOCrearClient(client, comandaSimple);
    await client.query('COMMIT');

    expect(clientId).not.toBeNull();

    const fila = await client.query<{
      nif: string | null;
      email: string | null;
      nom: string | null;
    }>('SELECT nif, email, nom FROM client WHERE id = $1', [clientId]);
    expect(fila.rows[0]).toEqual({
      nif: '[redactat]',
      email: 'restaurant.example@example.com',
      nom: 'Restaurant Example',
    });

    const total = await client.query<{ count: string }>('SELECT count(*) FROM client');
    expect(total.rows[0]?.count).toBe('1');
  });

  it('NIF por "_billing_myfield5" (segunda clave de meta_data): también resuelve, invitado', async () => {
    await client.query('BEGIN');
    const clientId = await resolverOCrearClient(client, comandaMultilinia);
    await client.query('COMMIT');

    expect(clientId).not.toBeNull();
    const fila = await client.query<{ nif: string | null; es_convidat: boolean }>(
      'SELECT nif, es_convidat FROM client WHERE id = $1',
      [clientId],
    );
    expect(fila.rows[0]?.nif).toBe('[redactat-convidat]');
    expect(fila.rows[0]?.es_convidat).toBe(true); // customer_id = 0
  });

  it('el mismo NIF en un segundo pedido reutiliza el cliente — no duplica, ni pisa el email ya guardado', async () => {
    const segundoPedido: WooOrder = {
      ...comandaSimple,
      id: comandaSimple.id + 1,
      billing: { ...comandaSimple.billing, email: 'otro.email@example.com' },
    };

    await client.query('BEGIN');
    const primeraVez = await resolverOCrearClient(client, comandaSimple);
    const segundaVez = await resolverOCrearClient(client, segundoPedido);
    await client.query('COMMIT');

    expect(segundaVez).toBe(primeraVez);

    // El criterio de prioridad (NIF gana) resuelve la ambigüedad de forma
    // consistente: mismo NIF -> mismo cliente, y el email del PRIMER
    // pedido que lo creó se conserva (COALESCE, no se pisa).
    const fila = await client.query<{ email: string }>('SELECT email FROM client WHERE id = $1', [
      primeraVez,
    ]);
    expect(fila.rows[0]?.email).toBe('restaurant.example@example.com');

    // No sumó un cliente nuevo: reutilizó el de "con NIF nuevo" (quedan los
    // mismos 2 de antes de este test — ese y el del invitado de "_billing_myfield5").
    const total = await client.query<{ count: string }>('SELECT count(*) FROM client');
    expect(total.rows[0]?.count).toBe('2');
  });

  it('sin NIF (meta_data vacío), resuelve por email — crea un cliente invitado nuevo', async () => {
    const soloEmail: WooOrder = {
      ...comandaSimple,
      id: 888001,
      customer_id: 0,
      meta_data: [], // sin NIF a propósito, para aislar el camino "sólo email"
      billing: { ...comandaSimple.billing, email: 'invitado.solo.email@example.com' },
    };

    await client.query('BEGIN');
    const clientId = await resolverOCrearClient(client, soloEmail);
    await client.query('COMMIT');

    expect(clientId).not.toBeNull();
    const fila = await client.query<{ nif: string | null; email: string; es_convidat: boolean }>(
      'SELECT nif, email, es_convidat FROM client WHERE id = $1',
      [clientId],
    );
    expect(fila.rows[0]?.nif).toBeNull();
    expect(fila.rows[0]?.email).toBe('invitado.solo.email@example.com');
    expect(fila.rows[0]?.es_convidat).toBe(true); // customer_id = 0
  });

  it('sin NIF ni email, no crea nada y devuelve null', async () => {
    const sinDatos: WooOrder = {
      ...comandaSimple,
      id: 999999,
      meta_data: [],
      billing: { ...comandaSimple.billing, email: '' },
    };

    await client.query('BEGIN');
    const clientId = await resolverOCrearClient(client, sinDatos);
    await client.query('COMMIT');

    expect(clientId).toBeNull();
  });

  describe('conflictos reales de identidad (dos NIF/email que no coinciden entre sí)', () => {
    it('NIF nuevo cuyo email ya pertenece a OTRO cliente existente: lanza, no duplica ni mezcla silenciosamente', async () => {
      // Cliente A: nif=NIF-A, email=compartido@example.com, customer_id propio
      // (distinto del de B) para aislar el conflicto en el email, no en woo_customer_id.
      const pedidoA: WooOrder = {
        ...comandaSimple,
        id: 777101,
        customer_id: 111111,
        meta_data: [{ id: 1, key: 'nif', value: 'NIF-A' }],
        billing: { ...comandaSimple.billing, email: 'compartido@example.com' },
      };
      await client.query('BEGIN');
      const clienteA = await resolverOCrearClient(client, pedidoA);
      await client.query('COMMIT');
      expect(clienteA).not.toBeNull();

      // Pedido B: NIF distinto (nunca visto) y customer_id distinto, pero el
      // MISMO email que A. El upsert declara ON CONFLICT (nif) — el
      // conflicto real ocurre en el índice único de email, que no es el
      // target declarado, así que Postgres lo rechaza con un error real en
      // vez de resolverlo solo.
      const pedidoB: WooOrder = {
        ...comandaSimple,
        id: 777102,
        customer_id: 222222,
        meta_data: [{ id: 2, key: 'nif', value: 'NIF-B' }],
        billing: { ...comandaSimple.billing, email: 'compartido@example.com' },
      };

      await client.query('BEGIN');
      await expect(resolverOCrearClient(client, pedidoB)).rejects.toThrow(/duplicate key|unique/i);
      await client.query('ROLLBACK');

      // No quedó ningún cliente con nif='NIF-B': el intento se revirtió entero.
      const total = await client.query<{ count: string }>(
        `SELECT count(*) FROM client WHERE nif = 'NIF-B'`,
      );
      expect(total.rows[0]?.count).toBe('0');
    });
  });
});
