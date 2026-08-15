import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/pool.js';

// Se podría leer de package.json, pero eso implica tocar el disco en el
// camino de un health check — más simple y más barato tenerla acá.
const VERSIO = '0.1.0';

export function registrarRutaSalut(fastify: FastifyInstance): void {
  fastify.get('/salut', async (_req, reply) => {
    let baseDades: 'ok' | 'error' = 'ok';
    try {
      // Chequeo mínimo y barato — no hay nada más liviano para confirmar
      // que el pool puede hablar con Postgres de verdad.
      await pool.query('SELECT 1');
    } catch {
      baseDades = 'error';
    }

    const estat = baseDades === 'ok' ? 'ok' : 'error';
    return reply.code(baseDades === 'ok' ? 200 : 503).send({ estat, versio: VERSIO, baseDades });
  });
}
