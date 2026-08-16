import type { ComandaDetallApi, ComandaResumApi, RespostaPaginada } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /comandes (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let producteFitxaId: number; // pes_kg fijo — kgEditable false
  let producteAMidaId: number; // sin pes_kg — kgEditable true
  let clientId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('comandes');
    construirServidor = entorn.construirServidor;

    const fitxa = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, pes_kg, preu_venda, tipus)
       VALUES ('LLF01', 'Llom fresc de porc', '1.250', '9.86', 'simple') RETURNING id_seq`,
    );
    producteFitxaId = Number(fitxa.rows[0]!.id_seq);
    const aMida = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, preu_venda, tipus)
       VALUES ('PIC01', 'Picada de porc', '7.60', 'simple') RETURNING id_seq`,
    );
    producteAMidaId = Number(aMida.rows[0]!.id_seq);
    const client = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO client (nom, poblacio) VALUES ('Restaurant Example', 'Manresa') RETURNING id_seq`,
    );
    clientId = Number(client.rows[0]!.id_seq);
  });

  afterAll(() => netejarEntornApi(entorn));

  it('POST /comandes: kgDemanats se calcula solo si el artículo tiene fitxa, hace falta indicarlo si no', async () => {
    const fastify = construirServidor();

    // Falta kgDemanats para el artículo a medida: 400 VALIDACIO.
    const sinKg = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'telefon',
        linies: [{ producteId: producteAMidaId, unitatsDemanades: 4 }],
      },
    });
    expect(sinKg.statusCode).toBe(400);
    expect(sinKg.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'telefon',
        clientId,
        linies: [
          { producteId: producteFitxaId, unitatsDemanades: 10 },
          { producteId: producteAMidaId, unitatsDemanades: 4, kgDemanats: '3.200' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<ComandaDetallApi>(res);
    expect(cuerpo.num).toMatch(/^\d{4}-\d{4}$/);
    expect(cuerpo.linies).toHaveLength(2);

    const liniaFitxa = cuerpo.linies.find((l) => l.producte?.id === producteFitxaId);
    expect(liniaFitxa?.kgDemanats).toBe('12.500'); // 10 × 1.250
    expect(liniaFitxa?.kgEditable).toBe(false);

    const liniaAMida = cuerpo.linies.find((l) => l.producte?.id === producteAMidaId);
    expect(liniaAMida?.kgDemanats).toBe('3.200');
    expect(liniaAMida?.kgEditable).toBe(true);

    await fastify.close();
  });

  it('POST /comandes sin líneas rechaza con 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: { origen: 'telefon', linies: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('GET /comandes?estat=amb_incidencia filtra correctamente (caso real: 1.995 pedidos con incidencia de catálogo)', async () => {
    const fastify = construirServidor();

    const oberta = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'telefon',
        linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
      },
    });
    const idOberta = cuerpoJson<ComandaDetallApi>(oberta).id;

    const incidencia = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'telefon',
        linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
      },
    });
    const idIncidencia = cuerpoJson<ComandaDetallApi>(incidencia).id;
    await entorn.poolTest.query(`UPDATE comanda SET estat = 'amb_incidencia' WHERE id_seq = $1`, [
      idIncidencia,
    ]);

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/comandes?estat=amb_incidencia',
    });
    expect(res.statusCode).toBe(200);
    const ids = cuerpoJson<RespostaPaginada<ComandaResumApi>>(res).dades.map((c) => c.id);
    expect(ids).toContain(idIncidencia);
    expect(ids).not.toContain(idOberta);

    await fastify.close();
  });

  it('PATCH /comandes/:id en una comanda congelada rechaza con 409 CONFLICTE', async () => {
    const fastify = construirServidor();
    const creada = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'telefon',
        linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
      },
    });
    const id = cuerpoJson<ComandaDetallApi>(creada).id;
    await entorn.poolTest.query(`UPDATE comanda SET congelat_a = now() WHERE id_seq = $1`, [id]);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${id}`,
      payload: { bultos: 5 },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

    // Lectura sigue funcionando — sólo la escritura está bloqueada.
    const lectura = await fastify.inject({ method: 'GET', url: `/api/v1/comandes/${id}` });
    expect(lectura.statusCode).toBe(200);
    expect(cuerpoJson<ComandaDetallApi>(lectura).congelada).toBe(true);

    await fastify.close();
  });

  it('DELETE .../linies/:liniaId marca esborrat, no elimina físicamente (ADR-006)', async () => {
    const fastify = construirServidor();
    const creada = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'telefon',
        linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
      },
    });
    const cosCreada = cuerpoJson<ComandaDetallApi>(creada);
    const comandaId = cosCreada.id;
    const liniaId = cosCreada.linies[0]!.id;

    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/v1/comandes/${comandaId}/linies/${liniaId}`,
    });
    expect(res.statusCode).toBe(204);

    const fila = await entorn.poolTest.query<{ esborrat: boolean }>(
      `SELECT esborrat FROM comanda_linia WHERE id_seq = $1`,
      [liniaId],
    );
    expect(fila.rows[0]?.esborrat).toBe(true);

    await fastify.close();
  });
});
