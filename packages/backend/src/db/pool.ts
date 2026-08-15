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

/**
 * Idempotente: llamarla más de una vez no reintenta cerrar un pool ya
 * cerrado.
 *
 * NO registra su propio handler de SIGTERM: eso vive en `src/index.ts`,
 * como el ÚLTIMO paso de la secuencia de apagado del servidor —
 * `fastify.close()` (deja de aceptar conexiones nuevas y drena las que
 * están en curso) antes de llamar acá. Cerrar el pool primero cortaría
 * peticiones en curso a mitad de una consulta.
 */
export function cerrarPool(): Promise<void> {
  cerrando ??= pool.end();
  return cerrando;
}
