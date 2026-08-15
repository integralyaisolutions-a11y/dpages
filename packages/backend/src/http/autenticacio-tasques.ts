import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const JWKS_GOOGLE = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Comparación en tiempo constante — mismo criterio que la firma del webhook. */
export function secretValid(rebut: string | undefined, esperat: string): boolean {
  if (rebut === undefined || rebut === '') return false;

  const bufRebut = Buffer.from(rebut, 'utf8');
  const bufEsperat = Buffer.from(esperat, 'utf8');
  if (bufRebut.length !== bufEsperat.length) return false;

  return timingSafeEqual(bufRebut, bufEsperat);
}

/**
 * Valida un token OIDC de Cloud Scheduler: firma contra las claves públicas
 * de Google, emisor y audiencia (la URL del propio endpoint). No valida
 * contra ninguna infraestructura propia — es exactamente lo que hace que
 * esto sea seguro sin tener que confiar en la red interna.
 */
export async function verificarOidc(token: string, audience: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWKS_GOOGLE, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * En producción: OIDC de Cloud Scheduler. En cualquier otro entorno: secreto
 * compartido por variable de entorno. Mismo header en los dos casos
 * (`Authorization: Bearer <token o secreto>`), sólo cambia qué se valida.
 *
 * `entorn` y `audiencia` son inyectables (default: `env.NODE_ENV` y
 * `env.TASQUES_OIDC_AUDIENCE`) para poder testear los tres caminos —
 * secreto compartido, OIDC válido, audiencia sin configurar — sin depender
 * de variables de entorno globales ni de red real.
 */
export async function autenticarTasca(
  authorizationHeader: string | undefined,
  entorn: string = env.NODE_ENV,
  audiencia: string | undefined = env.TASQUES_OIDC_AUDIENCE,
): Promise<boolean> {
  const token = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length)
    : undefined;

  if (entorn === 'production') {
    if (!audiencia) {
      logger.error(
        'TASQUES_OIDC_AUDIENCE no configurado en producción — se rechaza toda tarea hasta que se configure',
      );
      return false;
    }
    if (token === undefined) return false;
    return verificarOidc(token, audiencia);
  }

  return secretValid(token, env.TASQUES_SECRET);
}
