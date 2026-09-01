import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  crearMiddlewareAuth as crearMiddlewareAuthType,
  InfoUsuari,
  VerificadorToken,
} from './auth-firebase.js';
import type { construirServidor as construirServidorType } from './servidor.js';

/**
 * env.ts es un singleton que sólo lee `process.env` una vez, al importarse
 * (ver config/env.ts). Por default (vitest.config.ts) AUTH_DISABLED=true en
 * todo el proceso de test, así que el middleware real nunca exigiría un
 * token — mismo patrón que webhook.test.ts/tasques.test.ts con PGOPTIONS: se
 * sobrescribe la variable ANTES de importar dinámicamente cualquier módulo
 * que dependa de ella, para que este archivo (aislado del resto por Vitest)
 * ejercite el camino real de validación.
 */
let crearMiddlewareAuth: typeof crearMiddlewareAuthType;
let construirServidor: typeof construirServidorType;

beforeAll(async () => {
  process.env.AUTH_DISABLED = 'false';
  ({ crearMiddlewareAuth } = await import('./auth-firebase.js'));
  ({ construirServidor } = await import('./servidor.js'));
});

afterAll(() => {
  delete process.env.AUTH_DISABLED;
});

function crearReqFake(authorization?: string): FastifyRequest {
  return { headers: { authorization } } as FastifyRequest;
}

function crearReplyFake(): FastifyReply & { codigo?: number; cuerpo?: unknown } {
  const reply = {
    code(codigo: number) {
      reply.codigo = codigo;
      return reply;
    },
    send(cuerpo: unknown) {
      reply.cuerpo = cuerpo;
      return reply;
    },
  } as FastifyReply & { codigo?: number; cuerpo?: unknown };
  return reply;
}

describe('crearMiddlewareAuth (verificador simulado, sin Firebase real)', () => {
  it('sin cabecera Authorization: 401 NO_AUTENTICAT, no llama al verificador', async () => {
    const verificador: VerificadorToken = vi.fn();
    const req = crearReqFake();
    const reply = crearReplyFake();

    await crearMiddlewareAuth(verificador)(req, reply);

    expect(reply.codigo).toBe(401);
    expect(reply.cuerpo).toEqual({ error: { codi: 'NO_AUTENTICAT', missatge: 'No autoritzat' } });
    expect(verificador).not.toHaveBeenCalled();
    expect(req.usuari).toBeUndefined();
  });

  it('cabecera sin prefijo "Bearer ": 401, no llama al verificador', async () => {
    const verificador: VerificadorToken = vi.fn();
    const req = crearReqFake('token-sin-bearer');
    const reply = crearReplyFake();

    await crearMiddlewareAuth(verificador)(req, reply);

    expect(reply.codigo).toBe(401);
    expect(verificador).not.toHaveBeenCalled();
  });

  it('token inválido o expirado (el verificador devuelve null): 401', async () => {
    const verificador: VerificadorToken = vi.fn().mockResolvedValue(null);
    const req = crearReqFake('Bearer token-invalido');
    const reply = crearReplyFake();

    await crearMiddlewareAuth(verificador)(req, reply);

    expect(reply.codigo).toBe(401);
    expect(reply.cuerpo).toEqual({ error: { codi: 'NO_AUTENTICAT', missatge: 'No autoritzat' } });
    expect(verificador).toHaveBeenCalledWith('token-invalido');
    expect(req.usuari).toBeUndefined();
  });

  it('token válido: adjunta uid i rol a la request, sense respondre error', async () => {
    const infoUsuari: InfoUsuari = {
      uid: 'usuari-real-123',
      rol: 'oficina',
      email: 'anna@dpages.cat',
      nom: 'Anna',
    };
    const verificador: VerificadorToken = vi.fn().mockResolvedValue(infoUsuari);
    const req = crearReqFake('Bearer token-valid');
    const reply = crearReplyFake();

    await crearMiddlewareAuth(verificador)(req, reply);

    expect(reply.codigo).toBeUndefined();
    expect(req.usuari).toEqual(infoUsuari);
  });

  it('token válido sense custom claim de rol: rol queda en null, no bloqueja', async () => {
    const infoUsuari: InfoUsuari = {
      uid: 'usuari-sense-rol',
      rol: null,
      email: null,
      nom: null,
    };
    const verificador: VerificadorToken = vi.fn().mockResolvedValue(infoUsuari);
    const req = crearReqFake('Bearer token-valid');
    const reply = crearReplyFake();

    await crearMiddlewareAuth(verificador)(req, reply);

    expect(reply.codigo).toBeUndefined();
    expect(req.usuari).toEqual(infoUsuari);
  });
});

describe('/api/v1 con AUTH_DISABLED=false: exige token en rutas de negoci', () => {
  it('rechaza con 401 una ruta de negoci sin cabecera Authorization', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/productes' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { codi: 'NO_AUTENTICAT', missatge: 'No autoritzat' } });

    await fastify.close();
  });
});

describe('rutas fuera del scope de /api/v1: no pasan por este middleware', () => {
  it('GET /salut responde sin exigir cap token, aunque AUTH_DISABLED=false', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/salut' });

    // 200 estricto, no sólo "no 401": un 503 por base de datos inalcanzable
    // (bug real de CI, ver ADR-022) pasaría el chequeo débil igual de
    // silencioso que pasó al middleware — acá se exige la base alcanzable
    // Y sin token, las dos cosas.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ versio: '0.1.0', baseDades: 'ok' });

    await fastify.close();
  });
});

/**
 * Capa 47 — la URL del link de alta de usuario se arma con el mismo
 * criterio de entorno que opcionsCors() en cors.ts (ver cors.test.ts, del
 * que se copia el patrón: fijar process.env ANTES de vi.resetModules() +
 * reimportar, un describe por escenario). Se testea la función pura
 * exportada, no generarLinkEstabliment — ese sí llama a Firebase real y
 * nunca corre en los tests de este repo.
 */
describe('construirActionCodeSettingsEstabliment — fuera de producción', () => {
  let construirActionCodeSettingsEstabliment: () => { url: string; handleCodeInApp: boolean };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    vi.resetModules();
    ({ construirActionCodeSettingsEstabliment } = await import('./auth-firebase.js'));
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('usa el origen fijo de desarrollo (localhost:3000), sin leer CORS_ORIGIN', () => {
    const settings = construirActionCodeSettingsEstabliment();

    expect(settings).toEqual({
      url: 'http://localhost:3000/login?passwordReset=success',
      handleCodeInApp: false,
    });
  });
});

describe('construirActionCodeSettingsEstabliment — producción sin CORS_ORIGIN configurado', () => {
  let construirActionCodeSettingsEstabliment: () => { url: string; handleCodeInApp: boolean };

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_DISABLED; // production + AUTH_DISABLED=true no arranca (ADR-021)
    delete process.env.CORS_ORIGIN; // exactamente el caso que se está probando: sin configurar
    vi.resetModules();
    ({ construirActionCodeSettingsEstabliment } = await import('./auth-firebase.js'));
  });

  afterAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_DISABLED = 'false';
    vi.resetModules();
  });

  it('falla explícito en vez de generar una URL con el origen vacío', () => {
    expect(() => construirActionCodeSettingsEstabliment()).toThrow(/CORS_ORIGIN/);
  });
});

describe('construirActionCodeSettingsEstabliment — producción con CORS_ORIGIN configurado', () => {
  let construirActionCodeSettingsEstabliment: () => { url: string; handleCodeInApp: boolean };
  const ORIGEN_PRODUCCIO = 'https://app.dpages.cat';

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_DISABLED;
    process.env.CORS_ORIGIN = ORIGEN_PRODUCCIO;
    vi.resetModules();
    ({ construirActionCodeSettingsEstabliment } = await import('./auth-firebase.js'));
  });

  afterAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_DISABLED = 'false';
    delete process.env.CORS_ORIGIN;
    vi.resetModules();
  });

  it('usa CORS_ORIGIN como origen del link', () => {
    const settings = construirActionCodeSettingsEstabliment();

    expect(settings).toEqual({
      url: 'https://app.dpages.cat/login?passwordReset=success',
      handleCodeInApp: false,
    });
  });
});
