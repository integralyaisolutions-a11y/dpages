import type { RespostaPaginada, TransportistaApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /transportistes (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    entorn = await prepararEntornApi('transportistes');
    construirServidor = entorn.construirServidor;

    await entorn.poolTest.query(`INSERT INTO transportista (nom) VALUES ('DHL')`);
    await entorn.poolTest.query(
      `INSERT INTO transportista (nom, actiu) VALUES ('Recollida a la botiga', true)`,
    );
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /transportistes devuelve id secuencial y actiu', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/transportistes' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RespostaPaginada<TransportistaApi>>(res);
    expect(cuerpo.dades).toHaveLength(2);
    expect(cuerpo.dades.every((t) => t.actiu)).toBe(true);
    expect(cuerpo.paginacio.total).toBe(2);

    await fastify.close();
  });
});
