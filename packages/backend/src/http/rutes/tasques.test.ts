import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WooOrder, WooProduct } from '@dpages/shared';
import { Client, Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { migrarArriba } from '../../db/migrate.js';
import type { construirServidor as construirServidorType } from '../servidor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function leerFixture<T>(nombre: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, '../../__fixtures__', nombre), 'utf8')) as T;
}

const producteCa = leerFixture<WooProduct>('producte-ca.json');
const comandaSimple = leerFixture<WooOrder>('comanda-simple.json');

function respuestaPagina(items: unknown[], totalPaginas = 1): Response {
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-wp-totalpages': String(totalPaginas) },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Mismo patrón que webhook.test.ts: un solo esquema para todo el archivo,
 * porque las rutas usan el pool singleton de db/pool.ts y `PGOPTIONS` sólo
 * se lee al abrir una conexión física nueva — cambiarlo a mitad de archivo
 * arriesgaría reutilizar una conexión ya pegada al esquema anterior.
 */
const esquema = `test_tasques_${randomUUID().replaceAll('-', '_')}`;
let poolTest: Pool;
let construirServidor: typeof construirServidorType;

beforeAll(async () => {
  const setup = new Client({ connectionString: env.DATABASE_URL });
  await setup.connect();
  await setup.query(`CREATE SCHEMA "${esquema}"`);
  await setup.query(`SET search_path TO "${esquema}"`);
  await migrarArriba(setup);
  await setup.end();

  poolTest = new Pool({ connectionString: env.DATABASE_URL, options: `-c search_path=${esquema}` });

  process.env.PGOPTIONS = `-c search_path=${esquema}`;
  ({ construirServidor } = await import('../servidor.js'));
});

afterAll(async () => {
  delete process.env.PGOPTIONS;
  await poolTest.end();
  const cleanup = new Client({ connectionString: env.DATABASE_URL });
  await cleanup.connect();
  await cleanup.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
  await cleanup.end();
});

/**
 * NODE_ENV es 'test' en vitest.config.ts, así que autenticarTasca toma
 * siempre el camino de secreto compartido acá, nunca el de OIDC — ver
 * autenticacio-tasques.ts.
 */
describe.each([['/tasques/sync-comandes'], ['/tasques/sync-cataleg'], ['/tasques/reconciliar']])(
  'POST %s — autenticación',
  (url) => {
    it('rechaza con 401 sin cabecera Authorization', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({ method: 'POST', url });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: { codi: 'NO_AUTENTICAT', missatge: 'No autoritzat' } });
      await fastify.close();
    });

    it('rechaza con 401 con un secreto incorrecto', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url,
        headers: { authorization: 'Bearer secreto-equivocado' },
      });

      expect(res.statusCode).toBe(401);
      await fastify.close();
    });
  },
);

describe('POST /tasques/sync-comandes', () => {
  it('con secreto correcto: ingiere y transforma, y reintentarlo no duplica nada', async () => {
    fetchMock.mockResolvedValueOnce(respuestaPagina([comandaSimple]));

    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/tasques/sync-comandes',
      headers: { authorization: `Bearer ${env.TASQUES_SECRET}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ingesta: { itemsProcessats: 1 } });

    const comanda = await poolTest.query(`SELECT id FROM comanda WHERE woo_order_id = $1`, [
      comandaSimple.id,
    ]);
    expect(comanda.rowCount).toBe(1);

    // Reintento de Cloud Scheduler: mismo lote, sin fetch nuevo mockeado más
    // que este (idempotencia — ver ADR-009 y el guardián de versión).
    fetchMock.mockResolvedValueOnce(respuestaPagina([comandaSimple]));
    const res2 = await fastify.inject({
      method: 'POST',
      url: '/tasques/sync-comandes',
      headers: { authorization: `Bearer ${env.TASQUES_SECRET}` },
    });
    expect(res2.statusCode).toBe(200);

    const comandaDespues = await poolTest.query(`SELECT id FROM comanda WHERE woo_order_id = $1`, [
      comandaSimple.id,
    ]);
    expect(comandaDespues.rowCount).toBe(1);

    await fastify.close();
  });
});

describe('POST /tasques/sync-cataleg', () => {
  it('con secreto correcto: ingiere y transforma el catálogo', async () => {
    fetchMock.mockResolvedValueOnce(respuestaPagina([producteCa]));

    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/tasques/sync-cataleg',
      headers: { authorization: `Bearer ${env.TASQUES_SECRET}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ingesta: { itemsProcessats: 1 } });

    const article = await poolTest.query(`SELECT id FROM producte WHERE codi = $1`, [
      producteCa.sku,
    ]);
    expect(article.rowCount).toBe(1);

    await fastify.close();
  });
});

describe('POST /tasques/reconciliar', () => {
  it('con secreto correcto: fuerza la ventana de 7 días en comandas y catálogo', async () => {
    fetchMock
      .mockResolvedValueOnce(respuestaPagina([comandaSimple]))
      .mockResolvedValueOnce(respuestaPagina([producteCa]));

    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/tasques/reconciliar',
      headers: { authorization: `Bearer ${env.TASQUES_SECRET}` },
    });

    expect(res.statusCode).toBe(200);

    const urlComandes = fetchMock.mock.calls[0]?.[0] as URL;
    const urlCataleg = fetchMock.mock.calls[1]?.[0] as URL;
    expect(urlComandes.searchParams.has('modified_after')).toBe(true);
    expect(urlCataleg.searchParams.has('modified_after')).toBe(true);

    await fastify.close();
  });
});
