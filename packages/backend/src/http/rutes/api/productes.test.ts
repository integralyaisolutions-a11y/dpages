import type { ProducteApi, RespostaPaginada } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

describe('API negoci — /productes (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    entorn = await prepararEntornApi('productes');
    construirServidor = entorn.construirServidor;

    await entorn.poolTest.query(
      `INSERT INTO producte (codi, descripcio, pes_kg, tipus) VALUES ('LLF01', 'Llom fresc de porc', '1.250', 'simple')`,
    );
    await entorn.poolTest.query(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('PIC01', 'Picada de porc', 'simple')`,
    );
    // Capa 45 — agrupacio_produccio con mayúscula inicial, para el test de
    // filtro case-insensitive de más abajo.
    await entorn.poolTest.query(
      `INSERT INTO producte (codi, descripcio, tipus, agrupacio_produccio)
       VALUES ('COS01', 'Costelletes de porc', 'simple', 'Costelletes')`,
    );
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /productes: pesKg null es un valor funcional, no un error', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/productes?mida=10' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RespostaPaginada<ProducteApi>>(res);
    expect(cuerpo.paginacio.total).toBe(3);

    const llom = cuerpo.dades.find((p) => p.codi === 'LLF01');
    const picada = cuerpo.dades.find((p) => p.codi === 'PIC01');
    expect(llom?.pesKg).toBe('1.250');
    expect(picada?.pesKg).toBeNull();

    await fastify.close();
  });

  it('GET /productes?cerca= exige coincidencia EXACTA de descripció, no substring', async () => {
    // Regla 3.1 transversal (docs/especificacion-funcional-dpages.md):
    // buscar "llom" no debe traer "Llom fresc de porc" ni "Llom sencer" —
    // sólo una descripció idéntica (case-insensitive). Producto extra sólo
    // para este test, no afecta el total=3 de más arriba (ya se verificó).
    await entorn.poolTest.query(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('LLS01', 'Llom sencer', 'simple')`,
    );

    const fastify = construirServidor();

    const substring = await fastify.inject({ method: 'GET', url: '/api/v1/productes?cerca=llom' });
    const cuerpoSubstring = cuerpoJson<RespostaPaginada<ProducteApi>>(substring);
    expect(cuerpoSubstring.dades).toHaveLength(0);

    const exacte = await fastify.inject({
      method: 'GET',
      url: '/api/v1/productes?cerca=LLOM FRESC DE PORC',
    });
    const cuerpoExacte = cuerpoJson<RespostaPaginada<ProducteApi>>(exacte);
    expect(cuerpoExacte.dades).toHaveLength(1);
    expect(cuerpoExacte.dades[0]?.codi).toBe('LLF01');

    await fastify.close();
  });

  // Capa 45 — hallazgo de Michel: este filtro quedó case-sensitive por
  // descuido, inconsistente con ?cerca= de arriba. El fixture guarda
  // 'Costelletes' (mayúscula inicial) — 'costelletes' y 'COSTELLETES'
  // tienen que matchear igual.
  it('GET /productes?agrupacioProduccio= exige coincidencia exacta, case-insensitive', async () => {
    const fastify = construirServidor();

    const minuscules = await fastify.inject({
      method: 'GET',
      url: '/api/v1/productes?agrupacioProduccio=costelletes',
    });
    const cuerpoMinuscules = cuerpoJson<RespostaPaginada<ProducteApi>>(minuscules);
    expect(cuerpoMinuscules.dades).toHaveLength(1);
    expect(cuerpoMinuscules.dades[0]?.codi).toBe('COS01');

    const majuscules = await fastify.inject({
      method: 'GET',
      url: '/api/v1/productes?agrupacioProduccio=COSTELLETES',
    });
    const cuerpoMajuscules = cuerpoJson<RespostaPaginada<ProducteApi>>(majuscules);
    expect(cuerpoMajuscules.dades).toHaveLength(1);
    expect(cuerpoMajuscules.dades[0]?.codi).toBe('COS01');

    const capMatch = await fastify.inject({
      method: 'GET',
      url: '/api/v1/productes?agrupacioProduccio=llom',
    });
    const cuerpoCapMatch = cuerpoJson<RespostaPaginada<ProducteApi>>(capMatch);
    expect(cuerpoCapMatch.dades).toHaveLength(0);

    await fastify.close();
  });

  it('POST /productes crea un artículo nuevo', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/productes',
      payload: { descripcio: 'Botifarra blanca', tipus: 'simple' },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<ProducteApi>(res);
    expect(cuerpo.descripcio).toBe('Botifarra blanca');
    expect(cuerpo.actiu).toBe(true);

    await fastify.close();
  });

  it('POST /productes sin descripció rechaza con 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'POST', url: '/api/v1/productes', payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('PATCH /productes/:id actualiza el preu de venda', async () => {
    const fastify = construirServidor();
    const productes = await entorn.poolTest.query<{ id_seq: string }>(
      `SELECT id_seq FROM producte WHERE codi = 'LLF01'`,
    );
    const idPublic = Number(productes.rows[0]!.id_seq);

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/productes/${idPublic}`,
      payload: { preuVenda: '9.86' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ preuVenda: '9.86', codi: 'LLF01' });

    await fastify.close();
  });
});
