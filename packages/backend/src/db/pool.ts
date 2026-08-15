import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Cloud SQL en instancias chicas tiene pocas conexiones disponibles, y
  // Cloud Run escala instancias — cada una abre su propio pool. Un máximo
  // grande por instancia agota conexiones de base rápido; ver también el
  // agente cloud-run-optimizer.
  max: env.DB_POOL_MAX,
});

/**
 * Las conexiones inactivas del pool mueren por su cuenta (timeout del
 * servidor, reinicio de Cloud SQL) y eso es normal. Sin este handler, un
 * 'error' no escuchado en un EventEmitter de Node tira el proceso entero.
 */
pool.on('error', (err) => {
  logger.error({ err }, 'Error en una conexión inactiva del pool de Postgres');
});

let cerrando: Promise<void> | null = null;

/** Idempotente: llamarla más de una vez no reintenta cerrar un pool ya cerrado. */
export function cerrarPool(): Promise<void> {
  cerrando ??= pool.end();
  return cerrando;
}

/**
 * Cierre ordenado provisorio para esta capa (Docker y base de datos). Cuando
 * exista el servidor Fastify (capa "servidor HTTP"), este handler se
 * reemplaza por un paso dentro de SU secuencia de apagado: dejar de aceptar
 * conexiones → drenar las peticiones en curso → recién ahí cerrar el pool.
 * Hasta entonces, ante SIGTERM el pool se cierra directo.
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido, cerrando el pool de Postgres...');
  cerrarPool()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      logger.error({ err }, 'Error cerrando el pool de Postgres');
      process.exit(1);
    });
});
