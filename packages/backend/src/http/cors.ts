import type { FastifyCorsOptions } from '@fastify/cors';
import { env } from '../config/env.js';

/** El frontend de Michel corre acá en desarrollo — nada que configurar para levantar los dos en local. */
const ORIGEN_DESENVOLUPAMENT = 'http://localhost:3000';

/**
 * Mismo criterio que las demás guardas de entorno (WC_BASE_URL, AUTH_DISABLED):
 * el caso seguro es el default. Fuera de producción, el origen permitido es
 * el fijo de desarrollo. En producción viene de CORS_ORIGIN — si no está
 * configurada, CORS queda CERRADO (`origin: false`, ninguna petición
 * cross-origin pasa), nunca abierto a cualquiera por un descuido.
 */
export function opcionsCors(): FastifyCorsOptions {
  if (env.NODE_ENV === 'production') {
    return { origin: env.CORS_ORIGIN ?? false };
  }
  return { origin: ORIGEN_DESENVOLUPAMENT };
}
