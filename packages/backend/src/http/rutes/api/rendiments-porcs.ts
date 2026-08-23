import type { RendimentPorcApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import {
  construirPaginacio,
  enviarNoTrobat,
  enviarValidacio,
  parsearIdPublic,
  parsearPaginacio,
} from './comu.js';

const REGEX_UNITATS_PER_PORC = /^\d+(\.\d{1,2})?$/;
const REGEX_KG_PER_UNITAT = /^\d+(\.\d{1,3})?$/;

interface FilaRendimentPorc {
  id_seq: string;
  agrupacio_rendiment: string;
  categoria_nom: string;
  agrupacio_produccio: string | null;
  unitats_per_porc: string;
  kg_per_unitat: string;
  pes_total: string;
}

// producte (capa 22, BREAKING): ya no viaja en la respuesta — ver la nota
// en RendimentPorcApi (packages/shared). p.codi/p.descripcio ya no hacen
// falta en el SELECT; producte_id sigue siendo la FK que sustenta el join
// (no se toca la tabla ni la columna, sólo se saca del SELECT lo que ya no
// se expone).
function aApi(fila: FilaRendimentPorc): RendimentPorcApi {
  return {
    id: Number(fila.id_seq),
    agrupacioRendiment: fila.agrupacio_rendiment,
    categoria: fila.categoria_nom,
    agrupacioProduccio: fila.agrupacio_produccio,
    unitatsPerPorc: fila.unitats_per_porc,
    kgPerUnitat: fila.kg_per_unitat,
    pesTotal: fila.pes_total,
  };
}

// INNER JOIN a categoria_producte + `cat.agrupacio_rendiment IS NOT NULL`:
// RendimentPorcApi.agrupacioRendiment/categoria son no-nulos (capa 12), pero
// producte.categoria_id es nullable y categoria_producte.agrupacio_rendiment
// sólo tiene valor cuando elaborat_porc es true (migració 0011). Una fila de
// rendiments_porcs cuyo producto no cumple esto queda fuera del listado en
// vez de romper el contrato con un `null` donde el tipo no lo admite.
const SELECT_RENDIMENT = `
  SELECT r.id_seq, cat.agrupacio_rendiment,
         cat.nom AS categoria_nom, p.agrupacio_produccio,
         r.unitats_per_porc, r.kg_per_unitat,
         (r.unitats_per_porc * r.kg_per_unitat)::NUMERIC(10,3) AS pes_total
  FROM rendiments_porcs r
  JOIN producte p ON p.id = r.producte_id
  JOIN categoria_producte cat ON cat.id = p.categoria_id
`;

export function registrarRutesRendimentsPorcs(fastify: FastifyInstance): void {
  fastify.get('/rendiments-porcs', async (req) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    const condicions: string[] = ['cat.agrupacio_rendiment IS NOT NULL'];
    const valors: unknown[] = [];

    if (typeof query.agrupacioRendiment === 'string' && query.agrupacioRendiment !== '') {
      condicions.push(`cat.agrupacio_rendiment = $${valors.length + 1}`);
      valors.push(query.agrupacioRendiment);
    }
    if (typeof query.categoria === 'string' && query.categoria !== '') {
      condicions.push(`cat.nom = $${valors.length + 1}`);
      valors.push(query.categoria);
    }
    if (typeof query.agrupacioProduccio === 'string' && query.agrupacioProduccio !== '') {
      condicions.push(`p.agrupacio_produccio = $${valors.length + 1}`);
      valors.push(query.agrupacioProduccio);
    }
    if (typeof query.producte === 'string' && query.producte.trim() !== '') {
      // Coincidencia EXACTA por descripción, no substring (regla 3.1
      // transversal — docs/especificacion-funcional-dpages.md): "lomo" no
      // debe traer "cabeza de lomo". Case-insensitive, por eso LOWER() en
      // ambos lados en vez de ILIKE.
      condicions.push(`LOWER(p.descripcio) = LOWER($${valors.length + 1})`);
      valors.push(query.producte.trim());
    }

    const where = `WHERE ${condicions.join(' AND ')}`;

    const total = await pool.query<{ count: string }>(
      `SELECT count(*) FROM rendiments_porcs r
       JOIN producte p ON p.id = r.producte_id
       JOIN categoria_producte cat ON cat.id = p.categoria_id
       ${where}`,
      valors,
    );
    const files = await pool.query<FilaRendimentPorc>(
      `${SELECT_RENDIMENT} ${where} ORDER BY p.descripcio ASC LIMIT $${valors.length + 1} OFFSET $${valors.length + 2}`,
      [...valors, mida, offset],
    );

    return {
      dades: files.rows.map(aApi),
      paginacio: construirPaginacio(pagina, mida, Number(total.rows[0]?.count ?? 0)),
    };
  });

  fastify.post('/rendiments-porcs', async (req, reply) => {
    const cos = req.body as Partial<{
      producteId: number;
      unitatsPerPorc: string;
      kgPerUnitat: string;
    }>;

    if (cos.producteId === undefined || !Number.isInteger(cos.producteId)) {
      return enviarValidacio(reply, 'producteId és obligatori', [
        { camp: 'producteId', missatge: 'és obligatori' },
      ]);
    }
    if (!cos.unitatsPerPorc || !REGEX_UNITATS_PER_PORC.test(cos.unitatsPerPorc)) {
      return enviarValidacio(reply, 'unitatsPerPorc ha de ser un número vàlid (ex. "2.00")', [
        {
          camp: 'unitatsPerPorc',
          missatge: 'ha de ser un número vàlid amb com a màxim 2 decimals',
        },
      ]);
    }
    if (!cos.kgPerUnitat || !REGEX_KG_PER_UNITAT.test(cos.kgPerUnitat)) {
      return enviarValidacio(reply, 'kgPerUnitat ha de ser un número vàlid (ex. "3.500")', [
        { camp: 'kgPerUnitat', missatge: 'ha de ser un número vàlid amb com a màxim 3 decimals' },
      ]);
    }

    // Una sola consulta resuelve si el producto existe y si su categoría
    // tiene agrupació de rendiment — hace falta lo segundo para que la fila
    // que se está por crear pueda aparecer en el GET (ver nota en SELECT_RENDIMENT).
    const producte = await pool.query<{ id: string; agrupacio_rendiment: string | null }>(
      `SELECT p.id, cat.agrupacio_rendiment
       FROM producte p LEFT JOIN categoria_producte cat ON cat.id = p.categoria_id
       WHERE p.id_seq = $1`,
      [cos.producteId],
    );
    if (!producte.rows[0]) {
      return enviarValidacio(reply, 'El producte indicat no existeix', [
        { camp: 'producteId', missatge: 'no existeix' },
      ]);
    }
    if (producte.rows[0].agrupacio_rendiment === null) {
      return enviarValidacio(
        reply,
        'El producte no pertany a una categoria amb agrupació de rendiment definida',
        [
          {
            camp: 'producteId',
            missatge: 'la categoria del producte no té agrupació de rendiment',
          },
        ],
      );
    }

    const inserit = await pool.query<{ id_seq: string }>(
      `INSERT INTO rendiments_porcs (producte_id, unitats_per_porc, kg_per_unitat)
       VALUES ($1, $2, $3) RETURNING id_seq`,
      [producte.rows[0].id, cos.unitatsPerPorc, cos.kgPerUnitat],
    );

    const creat = await pool.query<FilaRendimentPorc>(`${SELECT_RENDIMENT} WHERE r.id_seq = $1`, [
      inserit.rows[0]!.id_seq,
    ]);

    reply.code(201);
    return aApi(creat.rows[0]!);
  });

  fastify.patch('/rendiments-porcs/:id', async (req, reply) => {
    const idPublic = parsearIdPublic((req.params as { id: string }).id);
    if (idPublic === null) return enviarNoTrobat(reply);

    const cos = req.body as Partial<{ unitatsPerPorc: string; kgPerUnitat: string }>;

    if (
      cos.unitatsPerPorc !== undefined &&
      (!cos.unitatsPerPorc || !REGEX_UNITATS_PER_PORC.test(cos.unitatsPerPorc))
    ) {
      return enviarValidacio(reply, 'unitatsPerPorc ha de ser un número vàlid (ex. "2.00")', [
        {
          camp: 'unitatsPerPorc',
          missatge: 'ha de ser un número vàlid amb com a màxim 2 decimals',
        },
      ]);
    }
    if (
      cos.kgPerUnitat !== undefined &&
      (!cos.kgPerUnitat || !REGEX_KG_PER_UNITAT.test(cos.kgPerUnitat))
    ) {
      return enviarValidacio(reply, 'kgPerUnitat ha de ser un número vàlid (ex. "3.500")', [
        { camp: 'kgPerUnitat', missatge: 'ha de ser un número vàlid amb com a màxim 3 decimals' },
      ]);
    }

    const resultat = await pool.query<{ id: string }>(
      `UPDATE rendiments_porcs SET
         unitats_per_porc = COALESCE($2, unitats_per_porc),
         kg_per_unitat = COALESCE($3, kg_per_unitat)
       WHERE id_seq = $1
       RETURNING id`,
      [idPublic, cos.unitatsPerPorc ?? null, cos.kgPerUnitat ?? null],
    );
    if (!resultat.rows[0]) return enviarNoTrobat(reply, 'Rendiment no trobat');

    const actualitzat = await pool.query<FilaRendimentPorc>(
      `${SELECT_RENDIMENT} WHERE r.id_seq = $1`,
      [idPublic],
    );
    return aApi(actualitzat.rows[0]!);
  });

  fastify.delete('/rendiments-porcs/:id', async (req, reply) => {
    const idPublic = parsearIdPublic((req.params as { id: string }).id);
    if (idPublic === null) return enviarNoTrobat(reply);

    const resultat = await pool.query<{ id: string }>(
      'DELETE FROM rendiments_porcs WHERE id_seq = $1 RETURNING id',
      [idPublic],
    );
    if (!resultat.rows[0]) return enviarNoTrobat(reply, 'Rendiment no trobat');

    reply.code(204);
  });
}
