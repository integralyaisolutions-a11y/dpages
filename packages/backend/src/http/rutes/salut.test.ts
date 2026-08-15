import { describe, expect, it } from 'vitest';
import { construirServidor } from '../servidor.js';

describe('GET /salut', () => {
  it('responde con la forma exacta del contrato, sin autenticación', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/salut' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ estat: 'ok', versio: '0.1.0', baseDades: 'ok' });

    await fastify.close();
  });
});
