import type { App } from 'firebase-admin/app';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { cosError } from './error-api.js';

/**
 * Se adjunta a `req.usuari` en toda ruta de negocio (contrato, sección 2).
 * `rol` viene de un custom claim de Firebase (`rol`, ej. "oficina" —
 * decisión de VisioFlow, no del cliente: el cliente pidió que NINGÚN
 * endpoint restrinja acceso por rol, así que esto es sólo para auditoría
 * — ver `comanda_linia.confirmat_per` — no para autorización).
 */
export interface InfoUsuari {
  uid: string;
  rol: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuari?: InfoUsuari;
  }
}

/** Inyectable: en tests se reemplaza por un verificador simulado, nunca se llama a Firebase real. */
export type VerificadorToken = (token: string) => Promise<InfoUsuari | null>;

let appFirebase: App | null = null;

/**
 * Perezoso a propósito: si esto corriera al importar el módulo, cualquier
 * test que importe `servidor.ts` (todos, indirectamente) inicializaría el
 * SDK de Firebase aunque nunca vaya a usarlo — nada grave, pero es trabajo
 * de más y una dependencia de red innecesaria en el arranque. Recién se
 * llama la primera vez que `verificarTokenFirebase` verifica un token de
 * verdad, y en desarrollo/test eso no pasa nunca (`AUTH_DISABLED` o un
 * verificador inyectado lo evitan).
 */
async function obtenerAppFirebase(): Promise<App> {
  if (appFirebase !== null) return appFirebase;
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const existentes = getApps();
  // Application Default Credentials: en Cloud Run, el service account de la
  // instancia ya alcanza — no hace falta ninguna variable de entorno nueva
  // (más allá de que el proyecto de Firebase exista). En local, hace falta
  // GOOGLE_APPLICATION_CREDENTIALS apuntando a una clave de servicio si
  // alguna vez se prueba con AUTH_DISABLED=false contra un proyecto real.
  appFirebase = existentes[0] ?? initializeApp();
  return appFirebase;
}

/**
 * Implementación real — nunca se ejecuta en los tests de este repo (se
 * inyecta un `VerificadorToken` simulado en su lugar, o `AUTH_DISABLED` la
 * evita entera). `verifyIdToken` ya valida firma, expiración, `aud`/`iss`
 * contra el proyecto de Firebase — no hay nada más que chequear acá.
 */
export const verificarTokenFirebase: VerificadorToken = async (token) => {
  try {
    const { getAuth } = await import('firebase-admin/auth');
    const app = await obtenerAppFirebase();
    const decodificado = await getAuth(app).verifyIdToken(token);
    const rol = typeof decodificado.rol === 'string' ? decodificado.rol : null;
    return { uid: decodificado.uid, rol };
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Token de Firebase inválido o expirado',
    );
    return null;
  }
};

function extraerToken(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

/**
 * `preHandler` de Fastify para las rutas de negocio (contrato, sección 2).
 * `/salut`, `/webhooks/woocommerce` y `/tasques/*` NO pasan por acá — viven
 * fuera del scope de plugin donde se registra este hook (ver servidor.ts),
 * tienen su propio mecanismo (HMAC / OIDC-secreto compartido).
 *
 * El bypass de desarrollo (`AUTH_DISABLED=true`) sólo es posible fuera de
 * producción — ver la guarda en config/env.ts, que hace imposible arrancar
 * el proceso con `AUTH_DISABLED=true` y `NODE_ENV=production` a la vez.
 */
export function crearMiddlewareAuth(verificador: VerificadorToken = verificarTokenFirebase) {
  return async function middlewareAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (env.NODE_ENV !== 'production' && env.AUTH_DISABLED) {
      req.usuari = { uid: 'dev-sense-auth', rol: null };
      return;
    }

    const token = extraerToken(req.headers.authorization);
    if (token === undefined) {
      reply.code(401).send(cosError('NO_AUTENTICAT', 'No autoritzat'));
      return;
    }

    const usuari = await verificador(token);
    if (usuari === null) {
      reply.code(401).send(cosError('NO_AUTENTICAT', 'No autoritzat'));
      return;
    }

    req.usuari = usuari;
  };
}
