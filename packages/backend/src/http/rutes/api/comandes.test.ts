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
      expect(liniaNova?.unitatsDemanades).toBe(3);
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
      expect(liniaEditada?.unitatsDemanades).toBe(5);
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
});
