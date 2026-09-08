import type { RendimentPorcApi, RespostaPaginada } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

/**
 * Issues #3/#4 (Francesc) — migración validada con Michelle (frontend): la
 * fila se identifica por categoriaId + agrupacioProduccio, no por
 * producteId. El fixture crea DOS productos en la misma categoria/grupo
 * ('LLF01'/'LLF02', ambos 'Llom') para poder confirmar que un único
 * rendiment cubre a todo el grupo, no a un producto puntual — exactamente
 * lo que el modelo viejo no garantizaba.
 */
describe('API negoci — /rendiments-porcs (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;
  let categoriaFrescId: number;
  let categoriaCongelatsId: number;
  let rendimentId: number;

  beforeAll(async () => {
    entorn = await prepararEntornApi('rendiments-porcs');
    construirServidor = entorn.construirServidor;

    const fresc = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO categoria_producte (nom, elaborat_porc, agrupacio_rendiment)
       VALUES ('Fresc', true, 'KG') RETURNING id_seq`,
    );
    categoriaFrescId = Number(fresc.rows[0]!.id_seq);
    const categoriaFrescRow = await entorn.poolTest.query<{ id: string }>(
      `SELECT id FROM categoria_producte WHERE id_seq = $1`,
      [categoriaFrescId],
    );
    // Dos productos, misma categoria, misma agrupació de producció — el caso
    // real que motivó la migración: un solo rendiment tiene que cubrir a
    // los dos.
    await entorn.poolTest.query(
      `INSERT INTO producte (codi, descripcio, tipus, categoria_id, agrupacio_produccio)
       VALUES ('LLF01', 'Llom fresc de porc', 'simple', $1, 'Llom')`,
      [categoriaFrescRow.rows[0]!.id],
    );
    await entorn.poolTest.query(
      `INSERT INTO producte (codi, descripcio, tipus, categoria_id, agrupacio_produccio)
       VALUES ('LLF02', 'Llom fresc de porc adobat', 'simple', $1, 'Llom')`,
      [categoriaFrescRow.rows[0]!.id],
    );

    const congelats = await entorn.poolTest.query<{ id_seq: string }>(
      `INSERT INTO categoria_producte (nom, elaborat_porc) VALUES ('Congelats', false) RETURNING id_seq`,
    );
    categoriaCongelatsId = Number(congelats.rows[0]!.id_seq);
    const categoriaCongelatsRow = await entorn.poolTest.query<{ id: string }>(
      `SELECT id FROM categoria_producte WHERE id_seq = $1`,
      [categoriaCongelatsId],
    );
    await entorn.poolTest.query(
      `INSERT INTO producte (codi, descripcio, tipus, categoria_id, agrupacio_produccio)
       VALUES ('CON01', 'Congelat sense rendiment', 'simple', $1, 'Congelat')`,
      [categoriaCongelatsRow.rows[0]!.id],
    );
  });

  afterAll(() => netejarEntornApi(entorn));

  it('POST /rendiments-porcs crea una ficha nueva con los campos derivados', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rendiments-porcs',
      payload: {
        categoriaId: categoriaFrescId,
        agrupacioProduccio: 'Llom',
        unitatsPerPorc: '2.00',
        kgPerUnitat: '3.500',
      },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<RendimentPorcApi>(res);
    // Capa 22 (BREAKING): producte ya NO viaja en la respuesta — confirmado
    // en runtime, no sólo por el tipo (que ya ni lo declara).
    expect(cuerpo).not.toHaveProperty('producte');
    expect(cuerpo.agrupacioRendiment).toBe('KG');
    expect(cuerpo.categoria).toBe('Fresc');
    expect(cuerpo.agrupacioProduccio).toBe('Llom');
    expect(cuerpo.unitatsPerPorc).toBe('2.00');
    expect(cuerpo.kgPerUnitat).toBe('3.500');
    expect(cuerpo.pesTotal).toBe('7.000');
    rendimentId = cuerpo.id;

    await fastify.close();
  });

  it('POST /rendiments-porcs amb una categoria que no té agrupació de rendiment retorna 400', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rendiments-porcs',
      payload: {
        categoriaId: categoriaCongelatsId,
        agrupacioProduccio: 'Congelat',
        unitatsPerPorc: '1.00',
        kgPerUnitat: '1.000',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('POST /rendiments-porcs amb categoriaId inexistent retorna 400', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rendiments-porcs',
      payload: {
        categoriaId: 999999,
        agrupacioProduccio: 'Llom',
        unitatsPerPorc: '1.00',
        kgPerUnitat: '1.000',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('POST /rendiments-porcs amb agrupacioProduccio que no coincideix amb cap producte real retorna 400', async () => {
    // Validación necesaria (no cosmética, ver el comentario en la ruta):
    // panells.ts hace un JOIN de texto exacto contra producte.agrupacio_produccio
    // — un typo acá dejaría la fila huérfana, invisible para el cálculo del
    // panel, en silencio.
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rendiments-porcs',
      payload: {
        categoriaId: categoriaFrescId,
        agrupacioProduccio: 'Llom sencer', // no existe cap producte amb aquest valor exacte
        unitatsPerPorc: '1.00',
        kgPerUnitat: '1.000',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('POST /rendiments-porcs duplicat (mateixa categoriaId + agrupacioProduccio) retorna 409 CONFLICTE', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rendiments-porcs',
      payload: {
        categoriaId: categoriaFrescId,
        agrupacioProduccio: 'Llom',
        unitatsPerPorc: '3.00',
        kgPerUnitat: '2.000',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

    await fastify.close();
  });

  it('GET /rendiments-porcs?agrupacioRendiment= filtra y devuelve la ficha creada', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/rendiments-porcs?agrupacioRendiment=KG',
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RespostaPaginada<RendimentPorcApi>>(res);
    expect(cuerpo.dades).toHaveLength(1);
    expect(cuerpo.dades[0]?.id).toBe(rendimentId);

    await fastify.close();
  });

  it('GET /rendiments-porcs?categoriaId= exige coincidencia exacta contra la categoria del rendiment', async () => {
    const fastify = construirServidor();

    const coincideix = await fastify.inject({
      method: 'GET',
      url: `/api/v1/rendiments-porcs?categoriaId=${categoriaFrescId}`,
    });
    const cuerpoCoincideix = cuerpoJson<RespostaPaginada<RendimentPorcApi>>(coincideix);
    expect(cuerpoCoincideix.dades).toHaveLength(1);
    expect(cuerpoCoincideix.dades[0]?.id).toBe(rendimentId);

    const noCoincideix = await fastify.inject({
      method: 'GET',
      url: `/api/v1/rendiments-porcs?categoriaId=${categoriaCongelatsId}`,
    });
    expect(cuerpoJson<RespostaPaginada<RendimentPorcApi>>(noCoincideix).dades).toHaveLength(0);

    await fastify.close();
  });

  // Capa 45 — hallazgo de Michel: este filtro quedó case-sensitive por
  // descuido. El fixture guarda 'Llom' (con mayúscula inicial) — 'llom' y
  // 'LLOM' tienen que matchear igual.
  it('GET /rendiments-porcs?agrupacioProduccio= exige coincidencia exacta, case-insensitive', async () => {
    const fastify = construirServidor();

    const minuscules = await fastify.inject({
      method: 'GET',
      url: '/api/v1/rendiments-porcs?agrupacioProduccio=llom',
    });
    const cuerpoMinuscules = cuerpoJson<RespostaPaginada<RendimentPorcApi>>(minuscules);
    expect(cuerpoMinuscules.dades).toHaveLength(1);
    expect(cuerpoMinuscules.dades[0]?.id).toBe(rendimentId);

    const majuscules = await fastify.inject({
      method: 'GET',
      url: '/api/v1/rendiments-porcs?agrupacioProduccio=LLOM',
    });
    const cuerpoMajuscules = cuerpoJson<RespostaPaginada<RendimentPorcApi>>(majuscules);
    expect(cuerpoMajuscules.dades).toHaveLength(1);
    expect(cuerpoMajuscules.dades[0]?.id).toBe(rendimentId);

    const capMatch = await fastify.inject({
      method: 'GET',
      url: '/api/v1/rendiments-porcs?agrupacioProduccio=costelletes',
    });
    const cuerpoCapMatch = cuerpoJson<RespostaPaginada<RendimentPorcApi>>(capMatch);
    expect(cuerpoCapMatch.dades).toHaveLength(0);

    await fastify.close();
  });

  it('PATCH /rendiments-porcs/:id actualiza sólo el campo enviado', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/rendiments-porcs/${rendimentId}`,
      payload: { unitatsPerPorc: '4.00' },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RendimentPorcApi>(res);
    expect(cuerpo.unitatsPerPorc).toBe('4.00');
    expect(cuerpo.kgPerUnitat).toBe('3.500');
    expect(cuerpo.pesTotal).toBe('14.000');

    await fastify.close();
  });

  it('PATCH /rendiments-porcs/:id ignora categoriaId/agrupacioProduccio si vénen al cos — són immutables', async () => {
    // Mateix comportament EXACTE que producteId abans d'aquesta migració
    // (i que codi a PATCH /clients/:id): el cos no té camp per a ells, així
    // que un intent de canviar-los es descarta en silenci, no es rebutja
    // amb 400 — no és un canvi de criteri d'UX, és el mateix de sempre.
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/rendiments-porcs/${rendimentId}`,
      payload: {
        categoriaId: categoriaCongelatsId,
        agrupacioProduccio: 'Un altre grup',
        kgPerUnitat: '5.000',
      },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RendimentPorcApi>(res);
    // categoriaId/agrupacioProduccio no cambiaron pese a venir en el body.
    expect(cuerpo.categoria).toBe('Fresc');
    expect(cuerpo.agrupacioProduccio).toBe('Llom');
    // El campo válido del mismo PATCH sí se aplicó.
    expect(cuerpo.kgPerUnitat).toBe('5.000');

    await fastify.close();
  });

  it('DELETE /rendiments-porcs/:id elimina la ficha y responde 204', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/v1/rendiments-porcs/${rendimentId}`,
    });

    expect(res.statusCode).toBe(204);

    const llista = await fastify.inject({ method: 'GET', url: '/api/v1/rendiments-porcs' });
    expect(cuerpoJson<RespostaPaginada<RendimentPorcApi>>(llista).paginacio.total).toBe(0);

    await fastify.close();
  });

  it('DELETE /rendiments-porcs/:id con un id inexistent da 404 NO_TROBAT', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({
      method: 'DELETE',
      url: '/api/v1/rendiments-porcs/999999',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

    await fastify.close();
  });
});
