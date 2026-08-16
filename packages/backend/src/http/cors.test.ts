import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { construirServidor as construirServidorType } from './servidor.js';

describe('CORS (@fastify/cors) — fuera de producción', () => {
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    ({ construirServidor } = await import('./servidor.js'));
  });

  it('preflight OPTIONS desde localhost:3000 recibe las cabeceras CORS correctas', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/v1/productes',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-methods']).toBeDefined();

    await fastify.close();
  });

  it('el origen configurado es un valor fijo, no un reflejo de cualquier Origin entrante', async () => {
    // Un origen ESTÁTICO (string, no una función que refleje el header
    // entrante) siempre devuelve ESE valor fijo, sin importar qué mande el
    // cliente — es lo que hace que un origen que no es localhost:3000 quede
    // bloqueado del lado del navegador (no coincide con lo que el servidor
    // declaró), no que el servidor lo detecte y lo rechace él mismo.
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/v1/productes',
      headers: { origin: 'http://malicious.example', 'access-control-request-method': 'GET' },
    });

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    await fastify.close();
  });
});

describe('CORS (@fastify/cors) — producción sin CORS_ORIGIN configurado', () => {
  let construirServidor: typeof construirServidorType;

  /**
   * env.ts es un singleton (mismo patrón que auth-firebase.test.ts): hay que
   * fijar process.env ANTES de volver a importar servidor.ts. vi.resetModules()
   * fuerza que se reevalúe con el entorno nuevo, en vez de reusar el módulo ya
   * cacheado por el describe de arriba.
   */
  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_DISABLED; // production + AUTH_DISABLED=true no arranca (ADR-021)
    delete process.env.CORS_ORIGIN; // exactamente el caso que se está probando: sin configurar
    vi.resetModules();
    ({ construirServidor } = await import('./servidor.js'));
  });

  afterAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_DISABLED = 'true';
    vi.resetModules();
  });

  it('rechaza el preflight: sin origen configurado, CORS queda cerrado', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/v1/productes',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
    });

    // origin: false (ver http/cors.ts) hace que @fastify/cors ni siquiera
    // registre el preflight como válido — cae en el 404 genérico del
    // notFoundHandler (servidor.ts), sin ninguna cabecera CORS.
    expect(res.statusCode).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();

    await fastify.close();
  });
});
