import type { CategoriaApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import {
  construirPaginacio,
  enviarNoTrobat,
  enviarValidacio,
  parsearIdPublic,
  parsearPaginacio,
} from './comu.js';

interface FilaCategoria {
  id_seq: string;
  nom: string;
  elaborat_porc: boolean;
  agrupacio_rendiment: string | null;
}

function aApi(fila: FilaCategoria): CategoriaApi {
  return {
    id: Number(fila.id_seq),
    nom: fila.nom,
    elaboratPorc: fila.elaborat_porc,
    agrupacioRendiment: fila.agrupacio_rendiment,
  };
}

export function registrarRutesCategories(fastify: FastifyInstance): void {
  fastify.get('/categories', async (req) => {
    const { pagina, mida, offset } = parsearPaginacio(req.query as Record<string, unknown>);

    const total = await pool.query<{ count: string }>('SELECT count(*) FROM categoria_producte');
    const files = await pool.query<FilaCategoria>(
      `SELECT id_seq, nom, elaborat_porc, agrupacio_rendiment
       FROM categoria_producte ORDER BY nom ASC LIMIT $1 OFFSET $2`,
      [mida, offset],
    );

    return {
      dades: files.rows.map(aApi),
      paginacio: construirPaginacio(pagina, mida, Number(total.rows[0]?.count ?? 0)),
    };
  });

  fastify.patch('/categories/:id', async (req, reply) => {
    const idPublic = parsearIdPublic((req.params as { id: string }).id);
    if (idPublic === null) return enviarNoTrobat(reply);

    const cos = req.body as Partial<{
      nom: string;
      elaboratPorc: boolean;
      agrupacioRendiment: string | null;
    }>;

    if (cos.nom !== undefined && cos.nom.trim() === '') {
      return enviarValidacio(reply, 'El nom no pot estar buit', [
        { camp: 'nom', missatge: 'no pot estar buit' },
      ]);
    }

    const resultat = await pool.query<FilaCategoria>(
      `UPDATE categoria_producte SET
         nom = COALESCE($2, nom),
         elaborat_porc = COALESCE($3, elaborat_porc),
         agrupacio_rendiment = CASE WHEN $4::boolean THEN $5 ELSE agrupacio_rendiment END
       WHERE id_seq = $1
       RETURNING id_seq, nom, elaborat_porc, agrupacio_rendiment`,
      [
        idPublic,
        cos.nom ?? null,
        cos.elaboratPorc ?? null,
        cos.agrupacioRendiment !== undefined,
        cos.agrupacioRendiment ?? null,
      ],
    );

    if (!resultat.rows[0]) return enviarNoTrobat(reply, 'Categoria no trobada');
    return aApi(resultat.rows[0]);
  });
}
