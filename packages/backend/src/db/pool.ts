import { Pool, types } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * comanda.data_comanda es una columna DATE (OID 1082). El parser por
 * defecto de `pg` para DATE construye un `Date` con el constructor
 * `new Date(año, mes, día)` — HORA LOCAL del proceso, no UTC — así que el
 * mismo valor de fila sale distinto según en qué huso horario corra el
 * proceso (con huso ≠ UTC, '2026-08-01' vuelve como
 * '2026-08-01T06:00:00Z'). Cloud Run corre en UTC, así que en producción
 * nunca se notaría — pero es exactamente el tipo de bug que no hay que
 * dejar pasar en dev/CI. Se registra ACÁ (no en cada consulta)
 * porque `pg-types` es un registro global del proceso — alcanza con
 * registrarlo una vez, antes de la primera consulta, para que aplique a
 * cualquier Pool/Client que use este mismo proceso (incluidos los que
 * crean los tests directamente, sin pasar por este pool).
 *
 * Se devuelve el string crudo ("YYYY-MM-DD"), sin convertir a Date: es
 * justamente lo que `formatearDataApi` (rutes/api/comu.ts) ya sabe
 * interpretar bien — `new Date("YYYY-MM-DD")` es UTC medianoche por
 * especificación (ECMA-262), sin la ambigüedad del constructor Y/M/D.
 */
types.setTypeParser(1082, (valor: string) => valor);

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
