import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import { logger } from '../lib/logger.js';
import type { construirServidor as construirServidorType } from './servidor.js';

/**
 * Bug real encontrado antes del push de capa 11: un 500 genuino (columna
 * inexistente por una migración sin aplicar) no dejaba ningún rastro en el
 * log — sólo "request completed" con el código, nunca el error de fondo.
 * `setErrorHandler` propio reemplaza el logging automático de Fastify
 * entero, no sólo la respuesta al cliente — sin loguear explícitamente acá,
 * un 500 real en producción sería indiagnosticable desde los logs.
 *
 * Se reproduce el mismo tipo de fallo (columna que la consulta espera y ya
 * no está) en un esquema aislado y descartable — un error real de Postgres,
 * no mockeado, mismo espíritu que el resto de los tests de este repo.
 */
describe('setErrorHandler global — 500 (Postgres real, esquema aislado)', () => {
  const esquema = `test_servidor_error_${randomUUID().replaceAll('-', '_')}`;
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    const setup = new Client({ connectionString: env.DATABASE_URL });
    await setup.connect();
    await setup.query(`CREATE SCHEMA "${esquema}"`);
    await setup.query(`SET search_path TO "${esquema}"`);
    await migrarArriba(setup);
    // Mismo síntoma que el bug real: una columna que la consulta de
    // /tarifes/matriu da por existente ya no está.
    await setup.query('ALTER TABLE tarifa DROP COLUMN codi');
    await setup.end();

    process.env.PGOPTIONS = `-c search_path=${esquema}`;
    ({ construirServidor } = await import('./servidor.js'));
  });

  afterAll(async () => {
    delete process.env.PGOPTIONS;
    const cleanup = new Client({ connectionString: env.DATABASE_URL });
    await cleanup.connect();
    await cleanup.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await cleanup.end();
  });

  it('responde 500 genérico al cliente, pero loguea el error completo (con stack) del lado del servidor', async () => {
    const errorSpy = vi.spyOn(logger, 'error');

    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/tarifes/matriu' });
    await fastify.close();

    // El cliente nunca ve el detalle interno — mensaje genérico, tal como
    // pide el contrato. (No se busca "codi" en el payload crudo: la forma
    // correcta de la respuesta YA tiene "codi": "ERROR_INTERN" como clave
    // — lo que no puede aparecer es el detalle real del error de Postgres.)
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { codi: 'ERROR_INTERN', missatge: 'Error intern del servidor' },
    });
    expect(res.payload).not.toContain('column');
    expect(res.payload).not.toContain('does not exist');

    // El servidor SÍ tiene que haber logueado el error real, completo.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [datos, mensaje] = errorSpy.mock.calls[0]!;
    expect(mensaje).toBe('Error intern no gestionat en una ruta');
    const { err } = datos as { err: Error };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('column');
    expect(err.stack).toBeDefined();

    errorSpy.mockRestore();
  });
});
