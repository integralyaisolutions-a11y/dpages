import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { configRedaccio } from './logger.js';

/**
 * Fastify sirve el serializer por defecto de "req" en cada petición y ahí
 * mete la IP del cliente (`req.remoteAddress`, ver servidor.ts) — sin esta
 * regla de redacción, cada línea de "incoming request" filtraría un dato
 * personal bajo RGPD.
 *
 * Se construye una instancia de Pino aparte con la MISMA `configRedaccio`
 * que usa el logger real, apuntando a un stream en memoria — el logger
 * singleton escribe a stdout vía sonic-boom, que no pasa por
 * `process.stdout.write`, así que no es interceptable desde acá.
 */
function crearLoggerDePrueba(): { logger: pino.Logger; leerUltimaLinea: () => unknown } {
  let ultimaLinea = '';
  const streamDePrueba = { write: (linea: string) => (ultimaLinea = linea) };
  const logger = pino({ redact: configRedaccio }, streamDePrueba);
  return { logger, leerUltimaLinea: () => JSON.parse(ultimaLinea) as unknown };
}

describe('logger — redacción RGPD', () => {
  it('censura req.remoteAddress (IP del cliente) en la salida', () => {
    const { logger, leerUltimaLinea } = crearLoggerDePrueba();

    logger.info({ req: { remoteAddress: '203.0.113.7', method: 'GET' } }, 'incoming request');

    const registro = leerUltimaLinea() as { req: { remoteAddress: string; method: string } };
    expect(registro.req.remoteAddress).toBe('[redactat]');
    expect(registro.req.method).toBe('GET');
  });

  it('censura el header Authorization', () => {
    const { logger, leerUltimaLinea } = crearLoggerDePrueba();

    logger.info({ req: { headers: { authorization: 'Bearer secreto' } } }, 'incoming request');

    const registro = leerUltimaLinea() as { req: { headers: { authorization: string } } };
    expect(registro.req.headers.authorization).toBe('[redactat]');
  });
});
