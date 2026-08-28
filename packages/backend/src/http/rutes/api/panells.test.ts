import type {
  ComandaDetallApi,
  PanellEmpaquetatApi,
  PanellObradorApi,
  PanellOficinaApi,
} from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /panells (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let producteId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('panells');
    construirServidor = entorn.construirServidor;

    const producte = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, pes_kg, preu_venda, tipus)
       VALUES ('LLF01', 'Llom fresc de porc', '1.250', '9.86', 'simple') RETURNING id_seq`,
    );
    producteId = Number(producte.rows[0]!.id_seq);

    const fastify = construirServidor();
    // 3 pedidos con la misma línea — más que la página (mida=2) para
    // verificar que `totals` cubre TODO lo filtrado, no sólo la página.
    for (let i = 0; i < 3; i++) {
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          linies: [{ producteId, unitatsDemanades: 2 }],
        },
      });
    }
    await fastify.close();
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /panells/oficina: totals cubre todo lo filtrado, no sólo la página visible', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/panells/oficina?mida=2' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<PanellOficinaApi>(res);
    expect(cuerpo.dades).toHaveLength(2); // página de 2
    expect(cuerpo.totals.comandes).toBe(3); // total real, no la página
    expect(cuerpo.totals.linies).toBe(3);
    expect(cuerpo.paginacio).toEqual({ pagina: 1, mida: 2, total: 3, totalPagines: 2 });

    await fastify.close();
  });

  it('GET /panells/empaquetat: una fila por línea, con liniesPendents/Confirmades correctos', async () => {
    const fastify = construirServidor();
    const abans = cuerpoJson<PanellEmpaquetatApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/empaquetat' }),
    );
    expect(abans.totals.linies).toBe(3);
    expect(abans.totals.liniesConfirmades).toBe(0);
    expect(abans.totals.liniesPendents).toBe(3);

    const primeraLinia = abans.dades[0]!;
    await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/comandes/${primeraLinia.comandaId}/linies/${primeraLinia.liniaId}/lliurament`,
      payload: { unitatsLliurades: 2, kgLliurats: '2.500' },
    });

    const despres = cuerpoJson<PanellEmpaquetatApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/empaquetat' }),
    );
    expect(despres.totals.liniesConfirmades).toBe(1);
    expect(despres.totals.liniesPendents).toBe(2);

    await fastify.close();
  });

  it('GET /panells/oficina: resumen liviano de incidencies (capa 10), sin el detalle completo', async () => {
    const fastify = construirServidor();

    const creada = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
    });
    const comandaId = cuerpoJson<{ id: number }>(creada).id;
    const comandaUuid = await entorn.poolTest.query<{ id: string }>(
      `SELECT id FROM comanda WHERE id_seq = $1`,
      [comandaId],
    );
    await entorn.poolTest.query(
      `INSERT INTO incidencia_comanda (comanda_id, tipus, detall) VALUES ($1, 'sense_dades_client', 'Sense NIF ni email')`,
      [comandaUuid.rows[0]!.id],
    );

    const cuerpo = cuerpoJson<PanellOficinaApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/oficina' }),
    );
    const fila = cuerpo.dades.find((f) => f.comandaId === comandaId);
    expect(fila?.totalIncidencies).toBe(1);
    expect(fila?.tipusIncidencia).toBe('sense_dades_client');

    await fastify.close();
  });

  // Al final del describe a propósito: crea un pedido más, y los tests
  // anteriores (empaquetat, oficina) asumen totales exactos sobre los 3 del
  // beforeAll — de haber ido antes, los habría roto.
  it('GET /panells/obrador: líneas de pedido individuales (liniaId/comandaId/client reales, no agregado)', async () => {
    const fastify = construirServidor();

    // Cliente real — para verificar que "client" resuelve a un valor real y
    // no queda hardcodeado en null (capa 15, cambio A).
    const client = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO client (nom, poblacio) VALUES ('Restaurant Example', 'Manresa') RETURNING id_seq`,
    );
    const clientId = Number(client.rows[0]!.id_seq);
    const creada = await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: { origen: 'manual', clientId, linies: [{ producteId, unitatsDemanades: 3 }] },
    });
    const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
    const liniaCreada = comandaCreada.linies[0]!;

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/panells/obrador?mida=200' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<PanellObradorApi>(res);

    const filaNova = cuerpo.dades.find((f) => f.comandaId === comandaCreada.id);
    expect(filaNova).toBeDefined();
    expect(filaNova?.liniaId).toBe(liniaCreada.id);
    expect(filaNova?.client).toBe('Restaurant Example');
    expect(filaNova?.unitats).toBe(3);
    expect(filaNova?.kg).toBe('3.750'); // 3 × 1.250

    // Las 3 líneas del beforeAll siguen ahí, sin agrupar y sin cliente —
    // antes de esta reescritura habrían colapsado en una sola fila sumada.
    const filesDelBeforeAll = cuerpo.dades.filter(
      (f) => f.comandaId !== comandaCreada.id && f.unitats === 2 && f.client === null,
    );
    expect(filesDelBeforeAll.length).toBeGreaterThanOrEqual(3);

    // Ninguna fila comparte liniaId con otra — son líneas reales, no un agregado.
    expect(new Set(cuerpo.dades.map((f) => f.liniaId)).size).toBe(cuerpo.dades.length);

    await fastify.close();
  });

  // Capa 20 — filtros nuevos de Obrador (producte/format/envasat), pedidos
  // por el demo de Lovable. Al final del describe por el mismo motivo que
  // el test anterior: no debe alterar los totales que asumen los tests de
  // oficina/empaquetat de más arriba.
  it('GET /panells/obrador: filtros producte/format/envasat (capa 20)', async () => {
    const fastify = construirServidor();

    const producteFiltrat = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO producte (codi, descripcio, pes_kg, preu_venda, tipus, format, envasat)
       VALUES ('BOT01', 'Botifarra crua', '0.500', '6.20', 'simple', 'TALLAT', 'ESPECIAL')
       RETURNING id_seq`,
    );
    const producteFiltratId = Number(producteFiltrat.rows[0]!.id_seq);
    await fastify.inject({
      method: 'POST',
      url: '/api/v1/comandes',
      payload: {
        origen: 'manual',
        linies: [{ producteId: producteFiltratId, unitatsDemanades: 1 }],
      },
    });

    // producte: coincidencia EXACTA case-insensitive (regla 3.1 transversal,
    // mismo criterio que /panells/produccio) — no substring.
    const perProducteMayus = cuerpoJson<PanellObradorApi>(
      await fastify.inject({
        method: 'GET',
        url: '/api/v1/panells/obrador?producte=BOTIFARRA%20CRUA',
      }),
    );
    expect(perProducteMayus.dades).toHaveLength(1);
    expect(perProducteMayus.dades[0]?.producte.descripcio).toBe('Botifarra crua');

    const perProducteParcial = cuerpoJson<PanellObradorApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/obrador?producte=Botifarra' }),
    );
    expect(perProducteParcial.dades).toHaveLength(0); // substring no matchea

    const perProducteSenseMatch = cuerpoJson<PanellObradorApi>(
      await fastify.inject({
        method: 'GET',
        url: '/api/v1/panells/obrador?producte=No%20Existeix',
      }),
    );
    expect(perProducteSenseMatch.dades).toEqual([]);
    expect(perProducteSenseMatch.totals.linies).toBe(0);

    // format/envasat: coincidencia exacta.
    const perFormat = cuerpoJson<PanellObradorApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/obrador?format=TALLAT' }),
    );
    expect(perFormat.dades.map((f) => f.liniaId)).toContain(perProducteMayus.dades[0]?.liniaId);
    expect(perFormat.dades.every((f) => f.format === 'TALLAT')).toBe(true);

    const perEnvasat = cuerpoJson<PanellObradorApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/obrador?envasat=ESPECIAL' }),
    );
    expect(perEnvasat.dades.map((f) => f.liniaId)).toContain(perProducteMayus.dades[0]?.liniaId);
    expect(perEnvasat.dades.every((f) => f.envasat === 'ESPECIAL')).toBe(true);

    const perFormatSenseMatch = cuerpoJson<PanellObradorApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/panells/obrador?format=LLESCAT' }),
    );
    expect(perFormatSenseMatch.dades).toEqual([]);

    await fastify.close();
  });

  // Capa 35 — al final del describe por el mismo motivo que los dos
  // anteriores: crea pedidos propios y no debe alterar los totales que
  // asumen los tests de oficina/empaquetat de más arriba.
  describe('capa 35 — obsProduccio (capçalera o línia), 4 filtres nous i bultos a GET /panells/oficina', () => {
    it('obsProduccio: true quan NOMÉS una línia (activa) té contingut, encara que la capçalera estigui buida', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      expect(comandaCreada.obsProduccio).toBeNull(); // capçalera buida

      await entorn.poolTest.query(
        `UPDATE comanda_linia SET obs_produccio = 'Tallar més fi' WHERE id_seq = $1`,
        [comandaCreada.linies[0]!.id],
      );

      const cuerpo = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({ method: 'GET', url: '/api/v1/panells/oficina' }),
      );
      const fila = cuerpo.dades.find((f) => f.comandaId === comandaCreada.id);
      expect(fila?.obsProduccio).toBe(true);

      await fastify.close();
    });

    it('obsProduccio: false quan no hi ha cap observació ni a capçalera ni a cap línia activa', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const cuerpo = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({ method: 'GET', url: '/api/v1/panells/oficina' }),
      );
      const fila = cuerpo.dades.find((f) => f.comandaId === comandaCreada.id);
      expect(fila?.obsProduccio).toBe(false);

      await fastify.close();
    });

    it('obsLliurament NO cambia con esta capa: sigue siendo el texto de la cabecera, sin mirar líneas (comanda_linia no tiene esa columna)', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          obsLliurament: 'Entregar pels matins',
          linies: [{ producteId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const cuerpo = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({ method: 'GET', url: '/api/v1/panells/oficina' }),
      );
      const fila = cuerpo.dades.find((f) => f.comandaId === comandaCreada.id);
      expect(fila?.obsLliurament).toBe('Entregar pels matins');

      await fastify.close();
    });

    it('filtre ?tarifaId=: coincidència exacta, sense match → dades: []', async () => {
      const fastify = construirServidor();
      const tarifa = await entorn.poolTest.query<{ id: string; id_seq: string }>(
        `INSERT INTO tarifa (codi, nom) VALUES ('CAP35-TAR', 'Tarifa capa 35') RETURNING id, id_seq`,
      );
      const tarifaIdPublic = Number(tarifa.rows[0]!.id_seq);
      const client = await entorn.poolTest.query<{ id_seq: string }>(
        `INSERT INTO client (nom, poblacio, tarifa_id) VALUES ('Client capa 35', 'Vic', $1) RETURNING id_seq`,
        [tarifa.rows[0]!.id],
      );
      const clientIdPublic = Number(client.rows[0]!.id_seq);
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          clientId: clientIdPublic,
          tarifaId: tarifaIdPublic,
          linies: [{ producteId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const perTarifa = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: `/api/v1/panells/oficina?tarifaId=${tarifaIdPublic}`,
        }),
      );
      expect(perTarifa.dades.map((f) => f.comandaId)).toContain(comandaCreada.id);
      expect(perTarifa.dades.every((f) => f.tarifa === 'Tarifa capa 35')).toBe(true);

      const senseMatch = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({ method: 'GET', url: '/api/v1/panells/oficina?tarifaId=999999' }),
      );
      expect(senseMatch.dades).toEqual([]);

      await fastify.close();
    });

    it('filtre ?poblacioDesti=: coincidència exacta case-insensitive, sense match → dades: []', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { poblacioDesti: 'Girona Capa 35' },
      });

      const perPoblacio = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/oficina?poblacioDesti=GIRONA%20CAPA%2035',
        }),
      );
      expect(perPoblacio.dades.map((f) => f.comandaId)).toContain(comandaCreada.id);

      const senseMatch = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/oficina?poblacioDesti=No%20Existeix',
        }),
      );
      expect(senseMatch.dades).toEqual([]);

      await fastify.close();
    });

    it('filtres ?dataComandaDes=/?dataComandaFins=: rang sobre dataComanda, fora de rang → dades: []', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      // Rang ampli que cobreix "ara" — ha de matchejar.
      const dinsDeRang = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/oficina?dataComandaDes=2020-01-01&dataComandaFins=2099-12-31',
        }),
      );
      expect(dinsDeRang.dades.map((f) => f.comandaId)).toContain(comandaCreada.id);

      // Rang al futur — cap comanda (ni aquesta ni cap de les del fixture) es
      // va crear amb dataComanda al futur.
      const foraDeRang = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/oficina?dataComandaDes=2099-01-01&dataComandaFins=2099-12-31',
        }),
      );
      expect(foraDeRang.dades).toEqual([]);

      await fastify.close();
    });

    it('filtres ?dataLliuramentDes=/?dataLliuramentFins=: rang sobre dataLliurament, fora de rang → dades: []', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          dataLliurament: '2026-08-20T00:00:00Z',
          linies: [{ producteId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const dinsDeRang = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/oficina?dataLliuramentDes=2026-08-19&dataLliuramentFins=2026-08-21',
        }),
      );
      expect(dinsDeRang.dades.map((f) => f.comandaId)).toContain(comandaCreada.id);

      const foraDeRang = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/oficina?dataLliuramentDes=2026-09-01&dataLliuramentFins=2026-09-30',
        }),
      );
      expect(foraDeRang.dades).toEqual([]);

      await fastify.close();
    });

    it('bultos surt a la resposta amb el valor correcte', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      expect(comandaCreada.bultos).toBeNull();

      await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { bultos: 5 },
      });

      const cuerpo = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({ method: 'GET', url: '/api/v1/panells/oficina' }),
      );
      const fila = cuerpo.dades.find((f) => f.comandaId === comandaCreada.id);
      expect(fila?.bultos).toBe(5);

      await fastify.close();
    });
  });

  // Capa 36 — bug sistémico encontrado al verificar la capa 35: "...Fins"
  // se interpretaba como medianoche del día, cortando afuera cualquier
  // registro con hora real dentro de ese mismo día. Al final del describe
  // por el mismo motivo que los bloques anteriores.
  describe('capa 36 — els filtres "...Fins" inclouen el dia complet', () => {
    it('GET /panells/oficina?dataExpedicioDes=&dataExpedicioFins= del MISMO día (con hora real) matchea', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { dataExpedicio: '2026-08-28T14:14:00Z' },
      });

      const cuerpo = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/oficina?dataExpedicioDes=2026-08-28&dataExpedicioFins=2026-08-28',
        }),
      );
      expect(cuerpo.dades.some((f) => f.comandaId === comandaCreada.id)).toBe(true);

      await fastify.close();
    });

    it('GET /panells/oficina?dataComandaDes=avui&dataComandaFins=avui: un pedido creado HOY (con hora real) matchea', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const avui = new Date().toISOString().slice(0, 10);
      const cuerpo = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: `/api/v1/panells/oficina?dataComandaDes=${avui}&dataComandaFins=${avui}`,
        }),
      );
      expect(cuerpo.dades.some((f) => f.comandaId === comandaCreada.id)).toBe(true);

      await fastify.close();
    });

    it('GET /panells/oficina?dataLliuramentDes=&dataLliuramentFins= del MISMO día (con hora real) matchea', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: {
          origen: 'manual',
          dataLliurament: '2026-08-28T14:14:00Z',
          linies: [{ producteId, unitatsDemanades: 1 }],
        },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);

      const cuerpo = cuerpoJson<PanellOficinaApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/oficina?dataLliuramentDes=2026-08-28&dataLliuramentFins=2026-08-28',
        }),
      );
      expect(cuerpo.dades.some((f) => f.comandaId === comandaCreada.id)).toBe(true);

      await fastify.close();
    });

    it('GET /panells/obrador?dataProduccioDes=&dataProduccioFins= del MISMO día que la línea (con hora real) matchea', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await entorn.poolTest.query(
        `UPDATE comanda_linia SET data_produccio = '2026-08-28T14:14:00Z' WHERE id_seq = $1`,
        [comandaCreada.linies[0]!.id],
      );

      const cuerpo = cuerpoJson<PanellObradorApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/obrador?dataProduccioDes=2026-08-28&dataProduccioFins=2026-08-28',
        }),
      );
      expect(cuerpo.dades.some((f) => f.comandaId === comandaCreada.id)).toBe(true);

      await fastify.close();
    });

    it('GET /panells/empaquetat?dataExpedicioDes=&dataExpedicioFins= del MISMO día (con hora real) matchea', async () => {
      const fastify = construirServidor();
      const creada = await fastify.inject({
        method: 'POST',
        url: '/api/v1/comandes',
        payload: { origen: 'manual', linies: [{ producteId, unitatsDemanades: 1 }] },
      });
      const comandaCreada = cuerpoJson<ComandaDetallApi>(creada);
      await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/comandes/${comandaCreada.id}`,
        payload: { dataExpedicio: '2026-08-28T14:14:00Z' },
      });

      const cuerpo = cuerpoJson<PanellEmpaquetatApi>(
        await fastify.inject({
          method: 'GET',
          url: '/api/v1/panells/empaquetat?dataExpedicioDes=2026-08-28&dataExpedicioFins=2026-08-28',
        }),
      );
      expect(cuerpo.dades.some((f) => f.comandaId === comandaCreada.id)).toBe(true);

      await fastify.close();
    });
  });
});
