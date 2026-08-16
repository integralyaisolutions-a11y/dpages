import cors from '@fastify/cors';
import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from 'fastify';
import { crearMiddlewareAuth } from './auth-firebase.js';
import { opcionsCors } from './cors.js';
import { cosError } from './error-api.js';
import { logger } from '../lib/logger.js';
import { registrarRutesCategories } from './rutes/api/categories.js';
import { registrarRutesClients } from './rutes/api/clients.js';
import { registrarRutesComandes } from './rutes/api/comandes.js';
import { registrarRutaLliurament } from './rutes/api/lliurament.js';
import { registrarRutesPanells } from './rutes/api/panells.js';
import { registrarRutesProductes } from './rutes/api/productes.js';
import { registrarRutesTarifes } from './rutes/api/tarifes.js';
import { registrarRutesTransportistes } from './rutes/api/transportistes.js';
import { registrarRutaSalut } from './rutes/salut.js';
import { registrarRutesTasques } from './rutes/tasques.js';
import { registrarRutaWebhook } from './rutes/webhook.js';

export function construirServidor(): FastifyInstance {
  const fastify = Fastify({
    // Reutiliza el logger ya configurado (JSON estructurado + redacción de
    // datos personales, ver lib/logger.ts) en vez de que Fastify arme el
    // suyo. El cast es una fricción de tipos conocida entre las
    // definiciones de Fastify y Pino (no una incompatibilidad real en
    // tiempo de ejecución) — Fastify sólo necesita los métodos de nivel
    // estándar (info/warn/error/...), que Pino cumple de sobra.
    loggerInstance: logger as unknown as FastifyBaseLogger,
  });

  // Registrado en la instancia externa, global a TODAS las rutas (incluida
  // /salut — por si algún día un panel la consulta directo desde el
  // navegador). El plugin resuelve el preflight OPTIONS en su propio hook
  // `onRequest`, que Fastify siempre corre antes que `preHandler` sin
  // importar el orden de registro — no colisiona con el middleware de
  // autenticación (ADR-021) aunque ambos vivieran en el mismo scope.
  void fastify.register(cors, opcionsCors());

  // Captura el cuerpo CRUDO antes de que exista un JSON parseado — la firma
  // del webhook (ADR-002/016) se valida contra estos bytes exactos, nunca
  // contra una reserialización. Se aplica a toda petición JSON (barato) pero
  // sólo la ruta del webhook lo usa; el resto ignora req.rawBody.
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, cuerpo, done) => {
    // parseAs: 'buffer' garantiza un Buffer en tiempo de ejecución — la
    // firma de tipos de Fastify para este callback sigue admitiendo string.
    const cosBrut = cuerpo as Buffer;
    req.rawBody = cosBrut;
    if (cosBrut.length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(cosBrut.toString('utf8')) as unknown);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Contrato de API (docs/contrato-api.md): CUALQUIER error, incluidos los
  // no manejados por una ruta, tiene que salir con la forma
  // { error: { codi, missatge, detalls? } } — nunca la forma por defecto de
  // Fastify. El mensaje que ve el cliente es genérico: el detalle real
  // (stack incluido) ya quedó en el log de Fastify, no hace falta
  // exponerlo en la respuesta.
  fastify.setErrorHandler((err: FastifyError, _req, reply) => {
    const status =
      err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : 500;
    const codi = status === 500 ? 'ERROR_INTERN' : 'VALIDACIO';
    const missatge = status === 500 ? 'Error intern del servidor' : err.message;
    reply.code(status).send(cosError(codi, missatge));
  });

  fastify.setNotFoundHandler((_req, reply) => {
    reply.code(404).send(cosError('NO_TROBAT', 'Recurs no trobat'));
  });

  registrarRutaSalut(fastify);
  registrarRutaWebhook(fastify);
  registrarRutesTasques(fastify);

  // Endpoints de negocio (docs/contrato-api.md, capa 8) bajo /api/v1 — base
  // URL que el contrato fija en su sección 2. El hook de autenticación (ADR-021)
  // se registra ANTES que las rutas y sólo dentro de ESTE scope de plugin —
  // /salut, /webhooks/woocommerce y /tasques/* viven fuera de él, en la
  // instancia externa de `fastify`, y por eso nunca pasan por acá.
  void fastify.register(
    (api, _opts, done) => {
      api.addHook('preHandler', crearMiddlewareAuth());
      registrarRutesCategories(api);
      registrarRutesProductes(api);
      registrarRutesTarifes(api);
      registrarRutesClients(api);
      registrarRutesTransportistes(api);
      registrarRutesComandes(api);
      registrarRutaLliurament(api);
      registrarRutesPanells(api);
      done();
    },
    { prefix: '/api/v1' },
  );

  return fastify;
}
