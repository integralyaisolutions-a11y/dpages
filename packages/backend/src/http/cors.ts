import type { FastifyCorsOptions } from '@fastify/cors';
import { env } from '../config/env.js';

/** El frontend de Michel corre acá en desarrollo — nada que configurar para levantar los dos en local. */
const ORIGEN_DESENVOLUPAMENT = 'http://localhost:3000';

/**
 * `@fastify/cors` usa 'GET,HEAD,POST' como default de `methods` cuando no
 * se pasa explícito — sin esto, el preflight OPTIONS de cualquier
 * PATCH/DELETE (todas las pantallas de edición y borrado del sistema)
 * responde sin esos verbos en `access-control-allow-methods`, y el
 * navegador corta la petición real antes de mandarla (bug real, capa 26 —
 * confirmado con curl de preflight contra el backend corriendo). HEAD/PUT
 * no hacen falta: ningún endpoint del sistema los usa (verificado, grep
 * sobre todos los `fastify.<verbo>(` registrados).
 */
const METODES_PERMESOS = ['GET', 'POST', 'PATCH', 'DELETE'];

/**
 * Mismo criterio que las demás guardas de entorno (WC_BASE_URL, AUTH_DISABLED):
 * el caso seguro es el default. Fuera de producción, el origen permitido es
 * el fijo de desarrollo. En producción viene de CORS_ORIGIN — si no está
 * configurada, CORS queda CERRADO (`origin: false`, ninguna petición
 * cross-origin pasa), nunca abierto a cualquiera por un descuido.
 */
export function opcionsCors(): FastifyCorsOptions {
  if (env.NODE_ENV === 'production') {
    return { origin: env.CORS_ORIGIN ?? false, methods: METODES_PERMESOS };
  }
  return { origin: ORIGEN_DESENVOLUPAMENT, methods: METODES_PERMESOS };
}
