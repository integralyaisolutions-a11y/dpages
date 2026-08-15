import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../../db/pool.js';
import { finestraReconciliacio, ingerirCataleg, ingerirComandes } from '../../sync/ingesta.js';
import { transformarCataleg } from '../../transform/cataleg.js';
import { transformarComandes } from '../../transform/comandes.js';
import { autenticarTasca } from '../autenticacio-tasques.js';
import { cosError } from '../error-api.js';

/**
 * true = autenticado, ya escribió la respuesta 401 si no. Un solo chequeo
 * para las tres rutas — en producción valida OIDC de Cloud Scheduler, si
 * no, el secreto compartido (ver autenticacio-tasques.ts).
 */
async function autenticarOResponder(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const ok = await autenticarTasca(req.headers.authorization);
  if (!ok) {
    reply.code(401).send(cosError('NO_AUTENTICAT', 'No autoritzat'));
    return false;
  }
  return true;
}

/**
 * Las tres rutas son idempotentes por construcción, no por lógica nueva
 * acá: ingerirComandes/ingerirCataleg upsertean el aterrizaje y sólo avanzan
 * el cursor si el lote se procesó entero (capa de ingesta); transformarComandes/
 * transformarCataleg aplican el guardián de versión y el upsert por código
 * (capa de transformación). Si Cloud Scheduler reintenta, correr esto de
 * nuevo no duplica nada — ya estaba probado en capas anteriores.
 */
export function registrarRutesTasques(fastify: FastifyInstance): void {
  fastify.post('/tasques/sync-comandes', async (req, reply) => {
    if (!(await autenticarOResponder(req, reply))) return;
    const ingesta = await ingerirComandes(pool);
    const transformacio = await transformarComandes(pool);
    return reply.code(200).send({ ingesta, transformacio });
  });

  fastify.post('/tasques/sync-cataleg', async (req, reply) => {
    if (!(await autenticarOResponder(req, reply))) return;
    const ingesta = await ingerirCataleg(pool);
    const transformacio = await transformarCataleg(pool);
    return reply.code(200).send({ ingesta, transformacio });
  });

  fastify.post('/tasques/reconciliar', async (req, reply) => {
    if (!(await autenticarOResponder(req, reply))) return;
    const modifiedAfterForcat = finestraReconciliacio(7);

    const ingestaComandes = await ingerirComandes(pool, { modifiedAfterForcat });
    const transformacioComandes = await transformarComandes(pool);
    const ingestaCataleg = await ingerirCataleg(pool, { modifiedAfterForcat });
    const transformacioCataleg = await transformarCataleg(pool);

    return reply.code(200).send({
      ingestaComandes,
      transformacioComandes,
      ingestaCataleg,
      transformacioCataleg,
    });
  });
}
