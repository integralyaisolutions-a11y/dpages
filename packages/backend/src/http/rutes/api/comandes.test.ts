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
        origen: 'manual',
        linies: [{ producteId: producteAMidaId, unitatsDemanades: 4 }],
      },
    });
    expect(sinKg.statusCode).toBe(400);
    expect(sinKg.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'manual',
        clientId,
        linies: [
          { producteId: producteFitxaId, unitatsDemanades: 10 },
          { producteId: producteAMidaId, unitatsDemanades: 4, kgDemanats: '3.200' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<ComandaDetallApi>(res);
    expect(cuerpo.num).toMatch(/^\d{6}$/);
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
      payload: { origen: 'manual', linies: [] },
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
        origen: 'manual',
        linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
      },
    });
    const idOberta = cuerpoJson<ComandaDetallApi>(oberta).id;

    const incidencia = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'manual',
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
        origen: 'manual',
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
        origen: 'manual',
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

  it('GET /comandes/:id trae el detalle de incidencies; el listado sólo trae el resumen liviano (capa 10)', async () => {
    const fastify = construirServidor();

    const creada = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'manual',
        linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
      },
    });
    const comandaId = cuerpoJson<ComandaDetallApi>(creada).id;
    const comandaUuid = await entorn.poolTest.query<{ id: string }>(
      `SELECT id FROM comanda WHERE id_seq = $1`,
      [comandaId],
    );

    // Dos tipos reales del sistema (ver ADR-020): mismo caso que los 2.216
    // pedidos reales marcados amb_incidencia, con dos motivos distintos.
    await entorn.poolTest.query(
      `INSERT INTO incidencia_comanda (comanda_id, tipus, detall, creat_en) VALUES
         ($1, 'article_no_resolt', 'Línia 1: SKU sense alias', now() - interval '1 hour'),
         ($1, 'conflicte_identitat_client', 'woo_customer_id xocat amb client existent', now())`,
      [comandaUuid.rows[0]!.id],
    );
    await entorn.poolTest.query(`UPDATE comanda SET estat = 'amb_incidencia' WHERE id_seq = $1`, [
      comandaId,
    ]);

    const detall = cuerpoJson<ComandaDetallApi>(
      await fastify.inject({ method: 'GET', url: `/api/v1/comandes/${comandaId}` }),
    );
    expect(detall.incidencies).toHaveLength(2);
    // Ordenado del más antiguo al más nuevo.
    expect(detall.incidencies[0]).toMatchObject({
      tipus: 'article_no_resolt',
      detall: 'Línia 1: SKU sense alias',
    });
    expect(detall.incidencies[1]?.tipus).toBe('conflicte_identitat_client');
    expect(detall.incidencies[0]?.creatA).toMatch(/Z$/);

    const llistat = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
      await fastify.inject({ method: 'GET', url: '/api/v1/comandes' }),
    );
    const resum = llistat.dades.find((c) => c.id === comandaId);
    // Dos tipos distintos: el resumen no puede elegir uno solo, queda null
    // — el detalle completo está en GET /comandes/:id, no acá.
    expect(resum?.totalIncidencies).toBe(2);
    expect(resum?.tipusIncidencia).toBeNull();

    await fastify.close();
  });

  it('GET /comandes/:id: la línea incluye categoria/format/envasat, igual que /panells/obrador (capa 20)', async () => {
    const fastify = construirServidor();

    const categoria = await entorn.poolTest.query<{ id: string }>(
      `INSERT INTO categoria_producte (nom) VALUES ('Embotits frescos') RETURNING id`,
    );
    const producte = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, pes_kg, preu_venda, tipus, categoria_id, format, envasat)
       VALUES ('BOT01', 'Botifarra crua', '0.500', '6.20', 'simple', $1, 'TALLAT', 'NORMAL')
       RETURNING id_seq`,
      [categoria.rows[0]!.id],
    );
    const producteAmbCategoriaId = Number(producte.rows[0]!.id_seq);

    const creada = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'manual',
        linies: [{ producteId: producteAmbCategoriaId, unitatsDemanades: 2 }],
      },
    });
    const comandaId = cuerpoJson<ComandaDetallApi>(creada).id;

    const detall = cuerpoJson<ComandaDetallApi>(
      await fastify.inject({ method: 'GET', url: `/api/v1/comandes/${comandaId}` }),
    );
    const linia = detall.linies[0]!;

    expect(linia.categoria).toBe('Embotits frescos');
    expect(linia.format).toBe('TALLAT');
    expect(linia.envasat).toBe('NORMAL');

    // El producte de fitxa del beforeAll no tiene categoria/format/envasat
    // asignados — deben resolver a null, no romper ni quedar undefined.
    const sense = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'manual',
        linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
      },
    });
    const comandaSenseId = cuerpoJson<ComandaDetallApi>(sense).id;
    const detallSense = cuerpoJson<ComandaDetallApi>(
      await fastify.inject({ method: 'GET', url: `/api/v1/comandes/${comandaSenseId}` }),
    );
    expect(detallSense.linies[0]?.categoria).toBeNull();
    expect(detallSense.linies[0]?.format).toBeNull();
    expect(detallSense.linies[0]?.envasat).toBeNull();

    await fastify.close();
  });

  it('resumen de incidencies: cuando todas comparten el mismo tipus, tipusIncidencia lo trae (no queda null)', async () => {
    const fastify = construirServidor();

    const creada = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'manual',
        linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
      },
    });
    const comandaId = cuerpoJson<ComandaDetallApi>(creada).id;
    const comandaUuid = await entorn.poolTest.query<{ id: string }>(
      `SELECT id FROM comanda WHERE id_seq = $1`,
      [comandaId],
    );
    await entorn.poolTest.query(
      `INSERT INTO incidencia_comanda (comanda_id, tipus, detall) VALUES
         ($1, 'article_no_resolt', 'Línia 1'),
         ($1, 'article_no_resolt', 'Línia 2')`,
      [comandaUuid.rows[0]!.id],
    );

    const llistat = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
      await fastify.inject({ method: 'GET', url: '/api/v1/comandes' }),
    );
    const resum = llistat.dades.find((c) => c.id === comandaId);
    expect(resum?.totalIncidencies).toBe(2);
    expect(resum?.tipusIncidencia).toBe('article_no_resolt');

    await fastify.close();
  });

  describe('capa 11 — adrecaLliurament (comanda) y dataProduccio por línia (comanda_linia)', () => {
    it('adrecaLliurament: null por defecto, editable vía PATCH, separado de poblacioDesti', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      expect(comandaCreada.adrecaLliurament).toBeNull();

      const patch = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { adrecaLliurament: 'Carrer Major, 12, 3r 2a', poblacioDesti: 'Vic' },
      });
      expect(patch.statusCode).toBe(200);
      const cuerpo = cuerpoJson<ComandaDetallApi>(patch);
      expect(cuerpo.adrecaLliurament).toBe('Carrer Major, 12, 3r 2a');
      expect(cuerpo.poblacioDesti).toBe('Vic'); // sigue siendo un campo distinto

      // También visible en el listado (ComandaResumApi).
      const llistat = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
        await fastify.inject({ method: 'GET', url: '/api/v1/comandes' }),
      );
      const resum = llistat.dades.find((c) => c.id === comandaCreada.id);
      expect(resum?.adrecaLliurament).toBe('Carrer Major, 12, 3r 2a');

      await fastify.close();
    });

    it('dataProduccio por línea: null por defecto, GET /comandes/:id la refleja cuando está cargada', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      expect(comandaCreada.linies[0]?.dataProduccio).toBeNull();

      // Sin endpoint de escritura todavía (no pedido en esta capa) — se
      // carga directo, como ya se hace con obs_produccio en este mismo nivel.
      await entorn.poolTest.query(
        `UPDATE comanda_linia SET data_produccio = '2026-08-20T07:00:00Z' WHERE id_seq = $1`,
        [comandaCreada.linies[0]!.id],
      );

      const detall = cuerpoJson<ComandaDetallApi>(
        await fastify.inject({ method: 'GET', url: `/api/v1/comandes/${comandaCreada.id}` }),
      );
      expect(detall.linies[0]?.dataProduccio).toBe('2026-08-20T07:00:00Z');

      await fastify.close();
    });
  });

  describe('capa 21 — datesProduccioLinies (GET /comandes) i filtros de data nous', () => {
    it('datesProduccioLinies: un pedido con TODAS sus líneas en la misma fecha trae un único valor', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [
            { producteId: producteFitxaId, unitatsDemanades: 1 },
            { producteId: producteAMidaId, unitatsDemanades: 2, kgDemanats: '1.000' },
          ],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await entorn.poolTest.query(
        `UPDATE comanda_linia SET data_produccio = '2026-08-20T07:00:00Z' WHERE comanda_id = (SELECT id FROM comanda WHERE id_seq = $1)`,
        [comandaCreada.id],
      );

      const llistat = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
        await fastify.inject({ method: 'GET', url: '/api/v1/comandes' }),
      );
      const resum = llistat.dades.find((c) => c.id === comandaCreada.id);
      expect(resum?.datesProduccioLinies).toEqual(['2026-08-20T07:00:00Z']);

      await fastify.close();
    });

    it('datesProduccioLinies: líneas con fechas distintas traen todas, ordenadas cronológicamente y sin repetir', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [
            { producteId: producteFitxaId, unitatsDemanades: 1 },
            { producteId: producteAMidaId, unitatsDemanades: 2, kgDemanats: '1.000' },
          ],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      const liniaA = comandaCreada.linies[0]!;
      const liniaB = comandaCreada.linies[1]!;

      // Cargadas en orden inverso a propósito — verifica que el backend
      // ordena, no que devuelve el orden de inserción.
      await entorn.poolTest.query(
        `UPDATE comanda_linia SET data_produccio = '2026-08-21T00:00:00Z' WHERE id_seq = $1`,
        [liniaA.id],
      );
      await entorn.poolTest.query(
        `UPDATE comanda_linia SET data_produccio = '2026-08-20T00:00:00Z' WHERE id_seq = $1`,
        [liniaB.id],
      );

      const llistat = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
        await fastify.inject({ method: 'GET', url: '/api/v1/comandes' }),
      );
      const resum = llistat.dades.find((c) => c.id === comandaCreada.id);
      expect(resum?.datesProduccioLinies).toEqual(['2026-08-20T00:00:00Z', '2026-08-21T00:00:00Z']);

      await fastify.close();
    });

    it('datesProduccioLinies: array vacío (no null) si ninguna línea tiene fecha de producción', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const llistat = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
        await fastify.inject({ method: 'GET', url: '/api/v1/comandes' }),
      );
      const resum = llistat.dades.find((c) => c.id === comandaCreada.id);
      expect(resum?.datesProduccioLinies).toEqual([]);

      await fastify.close();
    });

    it('GET /comandes?dataProduccioDes=&dataProduccioFins=: matchea si AL MENOS UNA línea cae en el rango', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await entorn.poolTest.query(
        `UPDATE comanda_linia SET data_produccio = '2026-08-20T07:00:00Z' WHERE id_seq = $1`,
        [comandaCreada.linies[0]!.id],
      );

      const dinsDelRang = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/comandes?dataProduccioDes=2026-08-19&dataProduccioFins=2026-08-21',
        }),
      );
      expect(dinsDelRang.dades.some((c) => c.id === comandaCreada.id)).toBe(true);

      const foraDelRang = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/comandes?dataProduccioDes=2026-09-01&dataProduccioFins=2026-09-30',
        }),
      );
      expect(foraDelRang.dades.some((c) => c.id === comandaCreada.id)).toBe(false);
      expect(foraDelRang.dades).toEqual([]);

      await fastify.close();
    });

    it('GET /comandes?dataLliuramentDes=&dataLliuramentFins=: filtra por la fecha de entrega de la cabecera', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          dataLliurament: '2026-08-20T00:00:00Z',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const dinsDelRang = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/comandes?dataLliuramentDes=2026-08-19&dataLliuramentFins=2026-08-21',
        }),
      );
      expect(dinsDelRang.dades.some((c) => c.id === comandaCreada.id)).toBe(true);

      const foraDelRang = cuerpoJson<RespostaPaginada<ComandaResumApi>>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/comandes?dataLliuramentDes=2026-09-01&dataLliuramentFins=2026-09-30',
        }),
      );
      expect(foraDelRang.dades).toEqual([]);

      await fastify.close();
    });
  });

  describe('capa 15 — cascada de resolució de preu de línia', () => {
    it('amb tarifa assignada al client i preu definit per aquest producte: fa servir el preu de la tarifa', async () => {
      const tarifa = await entorn.poolTest.query<{ id: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP15-A', 'Tarifa capa 15 A') RETURNING id`,
      );
      await entorn.poolTest.query(
        `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu)
         VALUES ($1, (SELECT id FROM producte WHERE id_seq = $2), '5.00')`,
        [tarifa.rows[0]!.id, producteFitxaId],
      );
      const client = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO client (nom, poblacio, tarifa_id) VALUES ('Client amb tarifa', 'Vic', $1) RETURNING id_seq`,
        [tarifa.rows[0]!.id],
      );
      const clientAmbTarifaId = Number(client.rows[0]!.id_seq);

      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          clientId: clientAmbTarifaId,
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 2 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.linies[0]?.preuUnitari).toBe('5.00');
      expect(cuerpo.estat).toBe('oberta');

      await fastify.close();
    });

    it('sense tarifa (o tarifa sense preu per aquest producte): fa servir producte.preuVenda', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.linies[0]?.preuUnitari).toBe('9.86'); // producte.preu_venda del beforeAll
      expect(cuerpo.estat).toBe('oberta');

      await fastify.close();
    });

    it('sense tarifa i sense preuVenda: preuUnitari queda en "0.00" i es registra incidència sense_preu', async () => {
      const producteSensePreu = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO producte (codi, descripcio, pes_kg, tipus)
         VALUES ('SP01', 'Producte sense preu', '1.000', 'simple') RETURNING id_seq`,
      );
      const producteSensePreuId = Number(producteSensePreu.rows[0]!.id_seq);

      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteSensePreuId, unitatsDemanades: 1 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.linies[0]?.preuUnitari).toBe('0.00');
      expect(cuerpo.estat).toBe('amb_incidencia');
      expect(cuerpo.incidencies.some((i) => i.tipus === 'sense_preu')).toBe(true);

      await fastify.close();
    });
  });

  describe('capa 30 — agregar/editar línies d’una comanda ja creada', () => {
    it('POST .../linies: agrega línia amb preu resolt (mateixa cascada, reusada), actualitza totalLinia i el total de la comanda', async () => {
      const tarifa = await entorn.poolTest.query<{ id: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP30-A', 'Tarifa capa 30 A') RETURNING id`,
      );
      await entorn.poolTest.query(
        `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu)
         VALUES ($1, (SELECT id FROM producte WHERE id_seq = $2), '4.50')`,
        [tarifa.rows[0]!.id, producteFitxaId],
      );
      const client = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO client (nom, poblacio, tarifa_id) VALUES ('Client capa 30', 'Vic', $1) RETURNING id_seq`,
        [tarifa.rows[0]!.id],
      );
      const clientCap30Id = Number(client.rows[0]!.id_seq);

      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          clientId: clientCap30Id,
          linies: [{ producteId: producteAMidaId, unitatsDemanades: 1, kgDemanats: '1.000' }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      const totalAbans = Number(comandaCreada.totalEur);

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/v1/comandes/${comandaCreada.id}/linies`,
        payload: { producteId: producteFitxaId, unitatsDemanades: 3 },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.linies).toHaveLength(2);
      const liniaNova = cuerpo.linies.find((l) => l.producte?.id === producteFitxaId);
      expect(liniaNova?.preuUnitari).toBe('4.50'); // resuelto vía tarifa — misma cascada que POST /comandes
      expect(liniaNova?.unitatsDemanades).toBe('3.00'); // capa 38 — NUMERIC(10,2), string
      expect(liniaNova?.totalLinia).toBe('13.50'); // 3 × 4.50
      expect(liniaNova?.kgDemanats).toBe('3.750'); // fitxa: 3 × 1.250

      const totalEsperat = (totalAbans + 3 * 4.5).toFixed(2);
      expect(cuerpo.totalEur).toBe(totalEsperat);

      // comanda.total (columna espejo — ningún GET la lee, ver nota en el
      // código) también quedó consistente tras el alta.
      const filaDb = await entorn.poolTest.query<{ total: string }>(
        `SELECT total FROM comanda WHERE id_seq = $1`,
        [comandaCreada.id],
      );
      expect(filaDb.rows[0]?.total).toBe(totalEsperat);

      await fastify.close();
    });

    it('POST .../linies sense preu resolt: registra incidència sense_preu i posa la comanda amb_incidencia', async () => {
      const producteSensePreu = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO producte (codi, descripcio, pes_kg, tipus)
         VALUES ('CAP30-SP', 'Sense preu', '1.000', 'simple') RETURNING id_seq`,
      );
      const producteSensePreuId = Number(producteSensePreu.rows[0]!.id_seq);

      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      expect(comandaCreada.estat).toBe('oberta');

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/v1/comandes/${comandaCreada.id}/linies`,
        payload: { producteId: producteSensePreuId, unitatsDemanades: 1 },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.estat).toBe('amb_incidencia');
      expect(cuerpo.incidencies.some((i) => i.tipus === 'sense_preu')).toBe(true);
      const liniaNova = cuerpo.linies.find((l) => l.producte?.id === producteSensePreuId);
      expect(liniaNova?.preuUnitari).toBe('0.00');

      await fastify.close();
    });

    it('POST .../linies en comanda congelada rebutja amb 409 CONFLICTE (mateixa guarda que PATCH de capçalera)', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await entorn.poolTest.query(`UPDATE comanda SET congelat_a = now() WHERE id_seq = $1`, [
        comandaCreada.id,
      ]);

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/v1/comandes/${comandaCreada.id}/linies`,
        payload: { producteId: producteFitxaId, unitatsDemanades: 1 },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

      await fastify.close();
    });

    it('PATCH .../linies/:liniaId: edita unitatsDemanades — recalcula totalLinia i el pes (fitxa), preuUnitari sense canvis, total de comanda actualitzat', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 2 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      const liniaCreada = comandaCreada.linies[0]!;
      expect(liniaCreada.preuUnitari).toBe('9.86');
      expect(liniaCreada.totalLinia).toBe('19.72'); // 2 × 9.86

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${liniaCreada.id}`,
        payload: { unitatsDemanades: 5 },
      });

      expect(res.statusCode).toBe(200);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      const liniaEditada = cuerpo.linies.find((l) => l.id === liniaCreada.id);
      expect(liniaEditada?.unitatsDemanades).toBe('5.00'); // capa 38 — NUMERIC(10,2), string
      expect(liniaEditada?.preuUnitari).toBe('9.86'); // sin cambios — nunca se re-resuelve
      expect(liniaEditada?.totalLinia).toBe('49.30'); // 5 × 9.86
      expect(liniaEditada?.kgDemanats).toBe('6.250'); // fitxa: 5 × 1.250
      expect(cuerpo.totalEur).toBe('49.30');

      await fastify.close();
    });

    it('PATCH .../linies/:liniaId: kgDemanats sobre un article amb fitxa (no editable) rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${comandaCreada.linies[0]!.id}`,
        payload: { kgDemanats: '3.000' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });

    it('PATCH .../linies/:liniaId en comanda congelada rebutja amb 409 CONFLICTE', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await entorn.poolTest.query(`UPDATE comanda SET congelat_a = now() WHERE id_seq = $1`, [
        comandaCreada.id,
      ]);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${comandaCreada.linies[0]!.id}`,
        payload: { unitatsDemanades: 9 },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

      await fastify.close();
    });

    it('PATCH .../linies/:liniaId: editar només obsProduccio no toca quantitats ni totalLinia', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 2 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      const liniaCreada = comandaCreada.linies[0]!;

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${liniaCreada.id}`,
        payload: { obsProduccio: 'Tallar més fi' },
      });

      expect(res.statusCode).toBe(200);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      const liniaEditada = cuerpo.linies.find((l) => l.id === liniaCreada.id);
      expect(liniaEditada?.obsProduccio).toBe('Tallar més fi');
      expect(liniaEditada?.unitatsDemanades).toBe(liniaCreada.unitatsDemanades);
      expect(liniaEditada?.totalLinia).toBe(liniaCreada.totalLinia);
      expect(cuerpo.totalEur).toBe(comandaCreada.totalEur);

      await fastify.close();
    });
  });

  describe('capa 31 — canvi manual d’estat (PATCH /comandes/:id)', () => {
    it('PATCH /comandes/:id: canvi lliure entre oberta/en_proces/tancada, sense restricció de transició', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      expect(comandaCreada.estat).toBe('oberta');

      const aEnProces = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { estat: 'en_proces' },
      });
      expect(aEnProces.statusCode).toBe(200);
      expect(cuerpoJson<ComandaDetallApi>(aEnProces).estat).toBe('en_proces');

      // De en_proces directo a tancada, sin pasar por ningún otro estado
      // intermedio — no hay máquina de estados que lo impida.
      const aTancada = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { estat: 'tancada' },
      });
      expect(aTancada.statusCode).toBe(200);
      expect(cuerpoJson<ComandaDetallApi>(aTancada).estat).toBe('tancada');

      // Y de vuelta a oberta, igual de libre.
      const aOberta = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { estat: 'oberta' },
      });
      expect(aOberta.statusCode).toBe(200);
      expect(cuerpoJson<ComandaDetallApi>(aOberta).estat).toBe('oberta');

      await fastify.close();
    });

    it('PATCH /comandes/:id: estat amb_incidencia sense detall rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { estat: 'amb_incidencia' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      // No quedó a medio aplicar: ni el estado ni ninguna incidencia nueva.
      const detall = await fastify.inject({
        method: 'GET',
        url: `/api/v1/comandes/${comandaCreada.id}`,
      });
      const cuerpo = cuerpoJson<ComandaDetallApi>(detall);
      expect(cuerpo.estat).toBe('oberta');
      expect(cuerpo.incidencies).toHaveLength(0);

      await fastify.close();
    });

    it('PATCH /comandes/:id: estat amb_incidencia amb detall aplica i registra incidència manual', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { estat: 'amb_incidencia', detall: 'Client es va queixar de la qualitat' },
      });

      expect(res.statusCode).toBe(200);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.estat).toBe('amb_incidencia');
      const incidenciaManual = cuerpo.incidencies.find((i) => i.tipus === 'manual');
      expect(incidenciaManual?.detall).toBe('Client es va queixar de la qualitat');

      await fastify.close();
    });

    it('PATCH /comandes/:id: canvi d’estat en comanda congelada rebutja amb 409 CONFLICTE', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await entorn.poolTest.query(`UPDATE comanda SET congelat_a = now() WHERE id_seq = $1`, [
        comandaCreada.id,
      ]);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { estat: 'tancada' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

      await fastify.close();
    });

    it('PATCH /comandes/:id: valor d’estat invàlid rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { estat: 'no_existeix' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });
  });

  describe('capa 32 — tarifaId explícit a POST /comandes (anul·la la del client per a l’alta)', () => {
    it('tarifaId explícit diferent de la del client: el preu resol contra la tarifa del body, no la del client', async () => {
      const tarifaClient = await entorn.poolTest.query<{ id: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP32-CLIENT', 'Tarifa del client') RETURNING id`,
      );
      await entorn.poolTest.query(
        `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu)
         VALUES ($1, (SELECT id FROM producte WHERE id_seq = $2), '5.00')`,
        [tarifaClient.rows[0]!.id, producteFitxaId],
      );
      const tarifaBody = await entorn.poolTest.query<{ id: string; id_seq: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP32-BODY', 'Tarifa indicada al body') RETURNING id, id_seq`,
      );
      await entorn.poolTest.query(
        `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu)
         VALUES ($1, (SELECT id FROM producte WHERE id_seq = $2), '6.75')`,
        [tarifaBody.rows[0]!.id, producteFitxaId],
      );
      const client = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO client (nom, poblacio, tarifa_id) VALUES ('Client capa 32', 'Girona', $1) RETURNING id_seq`,
        [tarifaClient.rows[0]!.id],
      );
      const clientCap32Id = Number(client.rows[0]!.id_seq);
      const tarifaBodyIdPublic = Number(tarifaBody.rows[0]!.id_seq);

      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          clientId: clientCap32Id,
          tarifaId: tarifaBodyIdPublic,
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 2 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.linies[0]?.preuUnitari).toBe('6.75'); // tarifa del body, no la del client (5.00)
      expect(cuerpo.tarifa?.id).toBe(tarifaBodyIdPublic); // comanda.tarifa_id queda guardat

      await fastify.close();
    });

    it('sense tarifaId al body: comportament actual sense canvis (fa servir la tarifa del client)', async () => {
      const tarifa = await entorn.poolTest.query<{ id: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP32-DEFAULT', 'Tarifa per defecte') RETURNING id`,
      );
      await entorn.poolTest.query(
        `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu)
         VALUES ($1, (SELECT id FROM producte WHERE id_seq = $2), '4.20')`,
        [tarifa.rows[0]!.id, producteFitxaId],
      );
      const client = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO client (nom, poblacio, tarifa_id) VALUES ('Client sense override', 'Lleida', $1) RETURNING id_seq`,
        [tarifa.rows[0]!.id],
      );
      const clientId32 = Number(client.rows[0]!.id_seq);

      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          clientId: clientId32,
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.linies[0]?.preuUnitari).toBe('4.20'); // tarifa del client, tal com ja funcionava
      expect(cuerpo.tarifa).toBeNull(); // comanda.tarifa_id no es toca si no ve explícit al body

      await fastify.close();
    });

    it('tarifaId invàlid al body: rebutja amb 400 VALIDACIO (mateix criteri que clientId invàlid)', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          tarifaId: 999999,
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });

    it('POST /comandes/:comandaId/linies (capa 30) no es veu afectat: continua fent servir sempre la tarifa del client', async () => {
      const tarifaClient = await entorn.poolTest.query<{ id: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP32-L30-CLIENT', 'Tarifa client (capa 30)') RETURNING id`,
      );
      await entorn.poolTest.query(
        `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu)
         VALUES ($1, (SELECT id FROM producte WHERE id_seq = $2), '3.30')`,
        [tarifaClient.rows[0]!.id, producteFitxaId],
      );
      const tarifaBody = await entorn.poolTest.query<{ id: string; id_seq: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP32-L30-BODY', 'Tarifa del body (capa 32)') RETURNING id, id_seq`,
      );
      await entorn.poolTest.query(
        `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu)
         VALUES ($1, (SELECT id FROM producte WHERE id_seq = $2), '8.00')`,
        [tarifaBody.rows[0]!.id, producteFitxaId],
      );
      const client = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO client (nom, poblacio, tarifa_id) VALUES ('Client capa 32+30', 'Tarragona', $1) RETURNING id_seq`,
        [tarifaClient.rows[0]!.id],
      );
      const clientId3230 = Number(client.rows[0]!.id_seq);
      const tarifaBodyIdPublic = Number(tarifaBody.rows[0]!.id_seq);

      const fastify = construirServidor();
      // La comanda nace con tarifaId explícito (capa 32) — comanda.tarifa_id
      // queda con la tarifa del body (8.00), NO la del cliente (3.30).
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          clientId: clientId3230,
          tarifaId: tarifaBodyIdPublic,
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      expect(comandaCreada.linies[0]?.preuUnitari).toBe('8.00');
      expect(comandaCreada.tarifa?.id).toBe(tarifaBodyIdPublic);

      // Agregar una línea nueva (capa 30) al mismo pedido: si usara
      // comanda.tarifa_id resolvería 8.00; si usa (como debe) la tarifa del
      // cliente, resuelve 3.30.
      const res = await fastify.inject({
        method: 'POST',
        url: `/api/v1/comandes/${comandaCreada.id}/linies`,
        payload: { producteId: producteFitxaId, unitatsDemanades: 1 },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      const liniaNova = cuerpo.linies.find((l) => l.id !== comandaCreada.linies[0]!.id);
      expect(liniaNova?.preuUnitari).toBe('3.30'); // tarifa del client, no la de comanda.tarifa_id

      await fastify.close();
    });
  });

  describe('capa 33 — SELECT_COMANDA_LINIA no ha de tornar línies esborrades', () => {
    it('GET /comandes/:id: després d’esborrar una línia, linies[] només mostra la que queda activa', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [
            { producteId: producteFitxaId, unitatsDemanades: 1 },
            { producteId: producteAMidaId, unitatsDemanades: 2, kgDemanats: '1.500' },
          ],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      expect(comandaCreada.linies).toHaveLength(2);
      const liniaAEsborrar = comandaCreada.linies.find((l) => l.producte?.id === producteFitxaId)!;
      const liniaQueQueda = comandaCreada.linies.find((l) => l.producte?.id === producteAMidaId)!;

      const esborrar = await fastify.inject({
        method: 'DELETE',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${liniaAEsborrar.id}`,
      });
      expect(esborrar.statusCode).toBe(204);

      const detall = await fastify.inject({
        method: 'GET',
        url: `/api/v1/comandes/${comandaCreada.id}`,
      });
      expect(detall.statusCode).toBe(200);
      const cuerpo = cuerpoJson<ComandaDetallApi>(detall);
      expect(cuerpo.linies).toHaveLength(1);
      expect(cuerpo.linies[0]?.id).toBe(liniaQueQueda.id);
      expect(cuerpo.linies.some((l) => l.id === liniaAEsborrar.id)).toBe(false);

      await fastify.close();
    });

    it('POST /comandes/:comandaId/linies: després d’esborrar una línia i afegir-ne una altra, la resposta segueix sense mostrar l’esborrada', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      const liniaAEsborrar = comandaCreada.linies[0]!;

      const esborrar = await fastify.inject({
        method: 'DELETE',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${liniaAEsborrar.id}`,
      });
      expect(esborrar.statusCode).toBe(204);

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/v1/comandes/${comandaCreada.id}/linies`,
        payload: { producteId: producteAMidaId, unitatsDemanades: 1, kgDemanats: '1.000' },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      expect(cuerpo.linies).toHaveLength(1);
      expect(cuerpo.linies[0]?.producte?.id).toBe(producteAMidaId);
      expect(cuerpo.linies.some((l) => l.id === liniaAEsborrar.id)).toBe(false);

      await fastify.close();
    });
  });

  describe('capa 34 — coherència temporal entre dates de capçalera i de línia', () => {
    it('POST /comandes: regla 5 — dataProduccio de línia posterior a dataLliurament rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          dataLliurament: '2026-08-20T00:00:00Z',
          linies: [
            {
              producteId: producteFitxaId,
              unitatsDemanades: 1,
              dataProduccio: '2026-08-25T00:00:00Z',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });

    it('POST /comandes: dates iguals (dataProduccio de línia = dataLliurament) està permès — "posterior" és estricte', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          dataLliurament: '2026-08-20T00:00:00Z',
          linies: [
            {
              producteId: producteFitxaId,
              unitatsDemanades: 1,
              dataProduccio: '2026-08-20T00:00:00Z',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);

      await fastify.close();
    });

    it('POST /comandes: dataProduccio de línia sense dataLliurament a la capçalera no bloqueja res', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [
            {
              producteId: producteFitxaId,
              unitatsDemanades: 1,
              dataProduccio: '2026-08-25T00:00:00Z',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);

      await fastify.close();
    });

    it('PATCH /comandes/:id: regla 1 — dataLliurament anterior a dataProduccio rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: {
          dataProduccio: '2026-08-20T00:00:00Z',
          dataLliurament: '2026-08-15T00:00:00Z',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });

    it('PATCH /comandes/:id: regla 2 — dataExpedicio anterior a dataProduccio rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: {
          dataProduccio: '2026-08-20T00:00:00Z',
          dataExpedicio: '2026-08-15T00:00:00Z',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });

    it('PATCH /comandes/:id: regla 3 — dataExpedicio posterior a dataLliurament rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: {
          dataExpedicio: '2026-08-20T00:00:00Z',
          dataLliurament: '2026-08-15T00:00:00Z',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });

    it('PATCH /comandes/:id (cas delicat): canviar dataLliurament invalida una línia existent NO tocada en aquest request — rebutja amb 400', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      const liniaId = comandaCreada.linies[0]!.id;

      // La línia queda amb dataProduccio = 25/08, sense cap data de
      // capçalera guardada encara — aquest PATCH en si no viola res.
      const patchLinia = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${liniaId}`,
        payload: { dataProduccio: '2026-08-25T00:00:00Z' },
      });
      expect(patchLinia.statusCode).toBe(200);

      // Ara la capçalera intenta fixar dataLliurament = 20/08 — anterior a
      // la dataProduccio de la línia (25/08). Aquest request NO toca la
      // línia per res, però igualment l'ha de rebutjar (regla 5).
      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { dataLliurament: '2026-08-20T00:00:00Z' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      // I la capçalera no va quedar a mig aplicar.
      const detall = cuerpoJson<ComandaDetallApi>(
        await fastify.inject({ method: 'GET', url: `/api/v1/comandes/${comandaCreada.id}` }),
      );
      expect(detall.dataLliurament).toBeNull();

      await fastify.close();
    });

    it('POST /comandes/:comandaId/linies: regla 4 — línia nova anterior a la dataProduccio de capçalera rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const patchCapcalera = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { dataProduccio: '2026-08-20T00:00:00Z' },
      });
      expect(patchCapcalera.statusCode).toBe(200);

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/v1/comandes/${comandaCreada.id}/linies`,
        payload: {
          producteId: producteFitxaId,
          unitatsDemanades: 1,
          dataProduccio: '2026-08-15T00:00:00Z',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });

    it('PATCH /comandes/:comandaId/linies/:liniaId: regla 6 — línia posterior a la dataExpedicio de capçalera rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      const liniaId = comandaCreada.linies[0]!.id;

      const patchCapcalera = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { dataExpedicio: '2026-08-20T00:00:00Z' },
      });
      expect(patchCapcalera.statusCode).toBe(200);

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${liniaId}`,
        payload: { dataProduccio: '2026-08-25T00:00:00Z' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });
  });

  describe('capa 36 — els filtres "...Fins" inclouen el dia complet (bug sistèmic trobat a la capa 35)', () => {
    it('GET /comandes?dataDes=avui&dataFins=avui: un pedido creado HOY (con hora real, no medianoche) aparece', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      // dataComanda = comanda.creat_en = now() en el momento del INSERT —
      // no se puede fijar por API, por eso "avui" en vez de una fecha fija.
      // Antes del fix, esto fallaba salvo que el test corriera exactamente
      // a medianoche UTC (bug reproducido: dataFins=avui se interpretaba
      // como avui a las 00:00:00, cortando afuera cualquier hora real).
      const avui = new Date().toISOString().slice(0, 10);
      const res = await fastify.inject({
        method: 'GET',
        url: `/api/v1/comandes?dataDes=${avui}&dataFins=${avui}`,
      });

      const cuerpo = cuerpoJson<RespostaPaginada<ComandaResumApi>>(res);
      expect(cuerpo.dades.some((c) => c.id === comandaCreada.id)).toBe(true);

      await fastify.close();
    });

    it('GET /comandes?dataProduccioDes=&dataProduccioFins= del MISMO día que la línea (con hora real) matchea', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await entorn.poolTest.query(
        `UPDATE comanda_linia SET data_produccio = '2026-08-28T14:14:00Z' WHERE id_seq = $1`,
        [comandaCreada.linies[0]!.id],
      );

      // Des y Fins son el MISMO día que la línea — antes del fix, Fins se
      // interpretaba como medianoche de ese día y dejaba afuera las 14:14.
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/comandes?dataProduccioDes=2026-08-28&dataProduccioFins=2026-08-28',
      });

      const cuerpo = cuerpoJson<RespostaPaginada<ComandaResumApi>>(res);
      expect(cuerpo.dades.some((c) => c.id === comandaCreada.id)).toBe(true);

      await fastify.close();
    });

    it('GET /comandes?dataLliuramentDes=&dataLliuramentFins= del MISMO día que dataLliurament (con hora real) matchea', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          dataLliurament: '2026-08-28T14:14:00Z',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/comandes?dataLliuramentDes=2026-08-28&dataLliuramentFins=2026-08-28',
      });

      const cuerpo = cuerpoJson<RespostaPaginada<ComandaResumApi>>(res);
      expect(cuerpo.dades.some((c) => c.id === comandaCreada.id)).toBe(true);

      await fastify.close();
    });
  });

  describe('capa 38 — unitatsDemanades/unitatsLliurades admeten decimals (NUMERIC(10,2), migració 0016)', () => {
    it('POST /comandes: alta de línia amb unitatsDemanades = 2.5 es guarda i es retorna com a string amb 2 decimals', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 2.5 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      const linia = cuerpo.linies[0]!;
      // BREAKING (capa 38): string, no number — mismo patrón que
      // kgDemanats/preuUnitari, que ya eran string.
      expect(typeof linia.unitatsDemanades).toBe('string');
      expect(linia.unitatsDemanades).toBe('2.50');
      expect(linia.kgDemanats).toBe('3.125'); // fitxa: 2.5 × 1.250

      await fastify.close();
    });

    it('POST /comandes: unitatsDemanades amb més de 2 decimals rebutja amb 400 VALIDACIO', async () => {
      const fastify = construirServidor();
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 2.567 }],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

      await fastify.close();
    });

    it('PATCH /comandes/:comandaId/linies/:liniaId: editar unitatsDemanades a 2.5 recalcula totalLinia i el pes correctament', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      const liniaCreada = comandaCreada.linies[0]!;

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}/linies/${liniaCreada.id}`,
        payload: { unitatsDemanades: 2.5 },
      });

      expect(res.statusCode).toBe(200);
      const cuerpo = cuerpoJson<ComandaDetallApi>(res);
      const liniaEditada = cuerpo.linies.find((l) => l.id === liniaCreada.id);
      expect(liniaEditada?.unitatsDemanades).toBe('2.50');
      expect(liniaEditada?.kgDemanats).toBe('3.125'); // fitxa: 2.5 × 1.250
      expect(liniaEditada?.totalLinia).toBe('24.65'); // 2.5 × 9.86

      await fastify.close();
    });

    it('GET /comandes/:id: el tipus de sortida d’unitatsDemanades/unitatsLliurades és string', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId: producteFitxaId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const detall = cuerpoJson<ComandaDetallApi>(
        await fastify.inject({ method: 'GET', url: `/api/v1/comandes/${comandaCreada.id}` }),
      );
      const linia = detall.linies[0]!;
      expect(typeof linia.unitatsDemanades).toBe('string');
      expect(typeof linia.unitatsLliurades).toBe('string');
      expect(linia.unitatsDemanades).toBe('1.00');
      expect(linia.unitatsLliurades).toBe('0.00');

      await fastify.close();
    });
  });
});
