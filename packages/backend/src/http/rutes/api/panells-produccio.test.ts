import type { PanellProduccioApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

/**
 * Reproduce EXACTO el ejemplo de referencia del prototipo (docs/contrato-api.md,
 * sección 4.10): 6 agrupaciones con valores dados (2 KG + 4 PAQ) más 3
 * agrupaciones MAGRE cuyos números individuales no vienen en el enunciado —
 * sólo su contribución a los totales (totalKgMagro=125, y el resto de
 * totalKgAElaborar=512.982 después de restar las dos KG). Se construyen acá
 * con valores propios (PERNIL/ESPATLLA/PAPADA, kg_per_unitat 12/6/7,
 * sumando exactamente 387.979 de kgAElaborar) para que el total cierre
 * igual que el prototipo.
 */
describe('API negoci — GET /panells/produccio (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;

  const DATA = '2026-08-20';

  async function crearAgrupacio(opts: {
    categoriaNom: string;
    agrupacioRendiment: 'KG' | 'PAQ' | 'MAGRE';
    producteCodi: string;
    agrupacioProduccio: string;
    unitatsPerPorc: string;
    kgPerUnitat: string;
    unitatsDemanades: number;
    pesCalculatKg: string;
    comandaId: string;
    ordinal: number;
  }): Promise<void> {
    let categoria = await entorn.poolTest.query<{ id: string }>(
      `SELECT id FROM categoria_producte WHERE nom = $1`,
      [opts.categoriaNom],
    );
    if (!categoria.rows[0]) {
      categoria = await entorn.poolTest.query<{ id: string }>(
        `INSERT INTO categoria_producte (nom, elaborat_porc, agrupacio_rendiment)
         VALUES ($1, true, $2) RETURNING id`,
        [opts.categoriaNom, opts.agrupacioRendiment],
      );
    }
    const producte = await entorn.poolTest.query<{ id: string }>(
      `INSERT INTO producte (codi, descripcio, tipus, categoria_id, agrupacio_produccio)
       VALUES ($1, $1, 'simple', $2, $3) RETURNING id`,
      [opts.producteCodi, categoria.rows[0]!.id, opts.agrupacioProduccio],
    );
    await entorn.poolTest.query(
      `INSERT INTO rendiments_porcs (producte_id, unitats_per_porc, kg_per_unitat)
       VALUES ($1, $2, $3)`,
      [producte.rows[0]!.id, opts.unitatsPerPorc, opts.kgPerUnitat],
    );
    await entorn.poolTest.query(
      `INSERT INTO comanda_linia (
         comanda_id, ordinal, producte_id, unitats_demanades, preu_unitari,
         pes_calculat_kg, data_produccio
       ) VALUES ($1, $2, $3, $4, '0.00', $5, $6)`,
      [
        opts.comandaId,
        opts.ordinal,
        producte.rows[0]!.id,
        opts.unitatsDemanades,
        opts.pesCalculatKg,
        DATA,
      ],
    );
  }

  beforeAll(async () => {
    entorn = await prepararEntornApi('panells-produccio');
    construirServidor = entorn.construirServidor;

    const comanda = await entorn.poolTest.query<{ id: string }>(
      `INSERT INTO comanda (origen_id, estat)
       VALUES ((SELECT id FROM origen_comanda WHERE codi = 'manual'), 'oberta') RETURNING id`,
    );
    const comandaId = comanda.rows[0]!.id;

    // KG — valores dados en el enunciado.
    await crearAgrupacio({
      categoriaNom: 'Peces Nobles KG',
      agrupacioRendiment: 'KG',
      producteCodi: 'COSTELLETA',
      agrupacioProduccio: 'COSTELLETA',
      unitatsPerPorc: '2.00',
      kgPerUnitat: '12.000',
      unitatsDemanades: 1,
      pesCalculatKg: '35.000',
      comandaId,
      ordinal: 0,
    });
    await crearAgrupacio({
      categoriaNom: 'Peces Nobles KG',
      agrupacioRendiment: 'KG',
      producteCodi: 'LLOM',
      agrupacioProduccio: 'LLOM',
      unitatsPerPorc: '2.00',
      kgPerUnitat: '2.500',
      unitatsDemanades: 1,
      pesCalculatKg: '90.003',
      comandaId,
      ordinal: 1,
    });

    // PAQ — valores dados en el enunciado (kgPerUnitat de la ficha no se usa
    // en la fórmula PAQ, pero la columna es NOT NULL — valor arbitrario).
    await crearAgrupacio({
      categoriaNom: 'Peces Nobles PAQ',
      agrupacioRendiment: 'PAQ',
      producteCodi: 'GALTES',
      agrupacioProduccio: 'GALTES',
      unitatsPerPorc: '2.00',
      kgPerUnitat: '1.000',
      unitatsDemanades: 70,
      pesCalculatKg: '1.000',
      comandaId,
      ordinal: 2,
    });
    await crearAgrupacio({
      categoriaNom: 'Peces Nobles PAQ',
      agrupacioRendiment: 'PAQ',
      producteCodi: 'ORELLA',
      agrupacioProduccio: 'ORELLA',
      unitatsPerPorc: '2.00',
      kgPerUnitat: '1.000',
      unitatsDemanades: 35,
      pesCalculatKg: '1.000',
      comandaId,
      ordinal: 3,
    });
    await crearAgrupacio({
      categoriaNom: 'Peces Nobles PAQ',
      agrupacioRendiment: 'PAQ',
      producteCodi: 'PEUS',
      agrupacioProduccio: 'PEUS',
      unitatsPerPorc: '4.00',
      kgPerUnitat: '1.000',
      unitatsDemanades: 132,
      pesCalculatKg: '1.000',
      comandaId,
      ordinal: 4,
    });
    await crearAgrupacio({
      categoriaNom: 'Peces Nobles PAQ',
      agrupacioRendiment: 'PAQ',
      producteCodi: 'SECRET',
      agrupacioProduccio: 'SECRET',
      unitatsPerPorc: '2.00',
      kgPerUnitat: '1.000',
      unitatsDemanades: 140,
      pesCalculatKg: '1.000',
      comandaId,
      ordinal: 5,
    });

    // MAGRE — tres agrupaciones que rinden 12/6/7 kg por cerdo (el ejemplo
    // del contrato), con kgAElaborar propios que suman 387.979 para que
    // totalKgAElaborar cierre en 512.982 (35.000 + 90.003 + 387.979).
    await crearAgrupacio({
      categoriaNom: 'Peces Magres',
      agrupacioRendiment: 'MAGRE',
      producteCodi: 'PERNIL',
      agrupacioProduccio: 'PERNIL',
      unitatsPerPorc: '1.00',
      kgPerUnitat: '12.000',
      unitatsDemanades: 1,
      pesCalculatKg: '150.000',
      comandaId,
      ordinal: 6,
    });
    await crearAgrupacio({
      categoriaNom: 'Peces Magres',
      agrupacioRendiment: 'MAGRE',
      producteCodi: 'ESPATLLA',
      agrupacioProduccio: 'ESPATLLA',
      unitatsPerPorc: '1.00',
      kgPerUnitat: '6.000',
      unitatsDemanades: 1,
      pesCalculatKg: '137.979',
      comandaId,
      ordinal: 7,
    });
    await crearAgrupacio({
      categoriaNom: 'Peces Magres',
      agrupacioRendiment: 'MAGRE',
      producteCodi: 'PAPADA',
      agrupacioProduccio: 'PAPADA',
      unitatsPerPorc: '1.00',
      kgPerUnitat: '7.000',
      unitatsDemanades: 1,
      pesCalculatKg: '100.000',
      comandaId,
      ordinal: 8,
    });
  });

  afterAll(() => netejarEntornApi(entorn));

  it('nombrePorcs=5 reproduce exacto los 6 renglones KG/PAQ y los totales del prototipo', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'GET',
      url: `/api/v1/panells/produccio?nombrePorcs=5&dataDes=${DATA}&dataFins=${DATA}&mida=50`,
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<PanellProduccioApi>(res);

    const porAgrupacio = new Map(cuerpo.dades.map((f) => [f.agrupacioProduccio, f]));

    expect(porAgrupacio.get('COSTELLETA')).toMatchObject({
      agrupacioRendiment: 'KG',
      kgAElaborar: '35.000',
      rendiment: '120.000',
      diferencia: '85.000',
      paqPedido: null,
    });
    expect(porAgrupacio.get('LLOM')).toMatchObject({
      agrupacioRendiment: 'KG',
      kgAElaborar: '90.003',
      rendiment: '25.000',
      diferencia: '-65.003',
      paqPedido: null,
    });
    expect(porAgrupacio.get('GALTES')).toMatchObject({
      agrupacioRendiment: 'PAQ',
      paqPedido: '70.00',
      rendiment: '10.00',
      diferencia: '-60.00',
      kgAElaborar: null,
    });
    expect(porAgrupacio.get('ORELLA')).toMatchObject({
      agrupacioRendiment: 'PAQ',
      paqPedido: '35.00',
      rendiment: '10.00',
      diferencia: '-25.00',
      kgAElaborar: null,
    });
    expect(porAgrupacio.get('PEUS')).toMatchObject({
      agrupacioRendiment: 'PAQ',
      paqPedido: '132.00',
      rendiment: '20.00',
      diferencia: '-112.00',
      kgAElaborar: null,
    });
    expect(porAgrupacio.get('SECRET')).toMatchObject({
      agrupacioRendiment: 'PAQ',
      paqPedido: '140.00',
      rendiment: '10.00',
      diferencia: '-130.00',
      kgAElaborar: null,
    });

    // Las tres filas MAGRE: sin cálculo por línia (rendiment/diferencia null).
    for (const codi of ['PERNIL', 'ESPATLLA', 'PAPADA']) {
      const fila = porAgrupacio.get(codi);
      expect(fila?.agrupacioRendiment).toBe('MAGRE');
      expect(fila?.rendiment).toBeNull();
      expect(fila?.diferencia).toBeNull();
      expect(fila?.paqPedido).toBeNull();
      expect(fila?.kgAElaborar).not.toBeNull();
    }

    expect(cuerpo.dades).toHaveLength(9);
    expect(cuerpo.totals).toEqual({
      totalKgAElaborar: '512.982',
      totalKgMagro: '125.000',
      diferencia: '-387.982',
    });

    await fastify.close();
  });

  it('sin nombrePorcs devuelve 400 VALIDACIO (no hay default silencioso)', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/panells/produccio' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('con nombrePorcs=0 devuelve 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/panells/produccio?nombrePorcs=0',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('?agrupacioRendiment=KG filtra sólo esa agrupación', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'GET',
      url: `/api/v1/panells/produccio?nombrePorcs=5&dataDes=${DATA}&dataFins=${DATA}&agrupacioRendiment=KG`,
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<PanellProduccioApi>(res);
    expect(cuerpo.dades).toHaveLength(2);
    expect(cuerpo.dades.every((f) => f.agrupacioRendiment === 'KG')).toBe(true);
    // El total ahora sólo cubre lo filtrado (KG), no las MAGRE.
    expect(cuerpo.totals.totalKgAElaborar).toBe('125.003'); // 35.000 + 90.003
    expect(cuerpo.totals.totalKgMagro).toBe('0.000');

    await fastify.close();
  });

  it('?producte= exige coincidencia exacta (case-insensitive), no substring', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'GET',
      url: `/api/v1/panells/produccio?nombrePorcs=5&dataDes=${DATA}&dataFins=${DATA}&producte=llom`,
    });

    const cuerpo = cuerpoJson<PanellProduccioApi>(res);
    expect(cuerpo.dades).toHaveLength(1);
    // producteCodi/descripcio y agrupacioProduccio valen 'LLOM' los tres en
    // este fixture (ver crearAgrupacio) — agrupacioProduccio confirma que
    // matcheó la fila correcta ahora que producte ya no viaja (capa 22).
    expect(cuerpo.dades[0]?.agrupacioProduccio).toBe('LLOM');
    expect(cuerpo.dades[0]).not.toHaveProperty('producte');

    const exacte = await fastify.inject({
      method: 'GET',
      url: `/api/v1/panells/produccio?nombrePorcs=5&dataDes=${DATA}&dataFins=${DATA}&producte=LLOM`,
    });
    expect(cuerpoJson<PanellProduccioApi>(exacte).dades).toHaveLength(1);

    await fastify.close();
  });

  it('fuera del rango de fechas no aparece nada', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/panells/produccio?nombrePorcs=5&dataDes=2026-01-01&dataFins=2026-01-02',
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<PanellProduccioApi>(res);
    expect(cuerpo.dades).toHaveLength(0);
    expect(cuerpo.totals).toEqual({
      totalKgAElaborar: '0.000',
      totalKgMagro: '0.000',
      diferencia: '0.000',
    });

    await fastify.close();
  });
});
