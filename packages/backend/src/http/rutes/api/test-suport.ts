import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { env } from '../../../config/env.js';
import { migrarArriba } from '../../../db/migrate.js';
import type { construirServidor as construirServidorType } from '../../servidor.js';

export interface EntornTestApi {
  esquema: string;
  poolTest: Pool;
  construirServidor: typeof construirServidorType;
}

/**
 * Mismo patrón que webhook.test.ts/tasques.test.ts: las rutas usan el pool
 * singleton de db/pool.ts, que sólo abre conexiones físicas de forma
 * perezosa — `PGOPTIONS` fijado ANTES del import dinámico de servidor.ts
 * alcanza para que esas conexiones nazcan con el mismo search_path que usa
 * `poolTest`. Un solo esquema por ARCHIVO de test (no por describe): una
 * vez que el pool abre una conexión, cambiar PGOPTIONS más tarde en el
 * mismo proceso no la afecta.
 */
export async function prepararEntornApi(prefix: string): Promise<EntornTestApi> {
  const esquema = `test_api_${prefix}_${randomUUID().replaceAll('-', '_')}`;
  const setup = new Client({ connectionString: env.DATABASE_URL });
  await setup.connect();
  await setup.query(`CREATE SCHEMA "${esquema}"`);
  await setup.query(`SET search_path TO "${esquema}"`);
  await migrarArriba(setup);
  // origen_comanda no se siembra en la migración (sus filas son datos de
  // arranque, ver seed-arranque.ts) — pero desde la capa 15 (migración
  // 0013), comanda.origen_id es NOT NULL y toda alta de comanda (manual o
  // sync) necesita resolver contra ella. Sin esto, cualquier test que cree
  // una comanda fallaría por falta de las filas mínimas que en un ambiente
  // real ya están cargadas antes de que el sistema reciba tráfico.
  await setup.query(`
    INSERT INTO origen_comanda (codi, nom) VALUES ('woocommerce', 'WooCommerce'), ('manual', 'Manual')
    ON CONFLICT (codi) DO NOTHING
  `);
  await setup.end();

  const poolTest = new Pool({
    connectionString: env.DATABASE_URL,
    options: `-c search_path=${esquema}`,
  });

  process.env.PGOPTIONS = `-c search_path=${esquema}`;
  const { construirServidor } = await import('../../servidor.js');

  return { esquema, poolTest, construirServidor };
}

/**
 * `res.json()` de light-my-request está tipado `any` — asignarlo directo
 * dispara `no-unsafe-assignment`/`no-unsafe-member-access` en cascada. Esta
 * función corta la propagación: la anotación de retorno explícita (`T`) es
 * lo único que ve el llamador, no el `any` de adentro.
 */
export function cuerpoJson<T>(res: { json: () => unknown }): T {
  return res.json() as T;
}

/**
 * Capa 39 — helper compartido: promueve el usuario auto-provisionado de
 * test (uid fijo `dev-sense-auth`, ver `AUTH_DISABLED`) al rol
 * Administrador, para poder ejercer endpoints con guarda de módulo
 * (`usuaris`/`rols`) en los tests. El bypass de desarrollo siempre resuelve
 * al mismo uid — no hay forma de simular un segundo usuario real vía
 * headers — así que "ser Administrador" en un test es literalmente mover
 * el `rol_id` de esa única fila. Dispara el auto-provisioning primero
 * (`GET /jo`) por si todavía no corrió en este esquema.
 */
export async function promoureAAdministrador(
  entorn: EntornTestApi,
  fastify: { inject: (opcions: { method: string; url: string }) => Promise<unknown> },
): Promise<void> {
  await fastify.inject({ method: 'GET', url: '/api/v1/jo' });
  await entorn.poolTest.query(
    `UPDATE usuari SET rol_id = (SELECT id FROM rol WHERE nom = 'Administrador')
     WHERE firebase_uid = 'dev-sense-auth'`,
  );
}

export async function netejarEntornApi(entorn: EntornTestApi): Promise<void> {
  delete process.env.PGOPTIONS;
  await entorn.poolTest.end();
  const cleanup = new Client({ connectionString: env.DATABASE_URL });
  await cleanup.connect();
  await cleanup.query(`DROP SCHEMA IF EXISTS "${entorn.esquema}" CASCADE`);
  await cleanup.end();
}
