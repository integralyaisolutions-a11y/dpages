import { ESTATS_COMANDA } from '@dpages/shared';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

// Placeholder de esta capa (Docker y base de datos). Se reemplaza en la capa
// de "servidor HTTP" por el arranque real de Fastify. Existe para validar
// que env.ts falla rápido si falta configuración y que el logger funciona.
logger.info(
  { estatsComanda: ESTATS_COMANDA, port: env.PORT, nodeEnv: env.NODE_ENV },
  'dpages backend — andamiaje inicial',
);
