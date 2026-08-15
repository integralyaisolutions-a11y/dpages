import { cerrarPool } from './db/pool.js';
import { construirServidor } from './http/servidor.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const fastify = construirServidor();

async function arrencar(): Promise<void> {
  try {
    // 0.0.0.0, no localhost: en Docker/Cloud Run el proceso tiene que
    // escuchar en todas las interfaces, no sólo en el loopback interno.
    await fastify.listen({ host: '0.0.0.0', port: env.PORT });
    logger.info({ port: env.PORT }, 'Servidor arrancado');
  } catch (err) {
    logger.error({ err }, 'No se pudo arrancar el servidor');
    process.exit(1);
  }
}

let apagando = false;

/**
 * Apagado ordenado ante SIGTERM, en este orden exacto:
 *   1. `fastify.close()` — deja de aceptar conexiones nuevas y espera a que
 *      terminen las peticiones en curso.
 *   2. Recién ahí, `cerrarPool()` — cerrar la base antes cortaría una
 *      consulta a mitad de una petición todavía en curso.
 */
async function apagarOrdenadamente(senal: string): Promise<void> {
  if (apagando) return;
  apagando = true;

  logger.info({ senal }, 'Señal de apagado recibida — dejando de aceptar conexiones nuevas');
  try {
    await fastify.close();
  } catch (err) {
    logger.error({ err }, 'Error cerrando el servidor HTTP');
  }

  logger.info('Conexiones drenadas — cerrando el pool de Postgres');
  await cerrarPool();

  logger.info('Apagado ordenado completo');
  process.exit(0);
}

process.on('SIGTERM', () => {
  void apagarOrdenadamente('SIGTERM');
});
// Conveniencia para detener el servidor con Ctrl+C en desarrollo local.
process.on('SIGINT', () => {
  void apagarOrdenadamente('SIGINT');
});

void arrencar();
