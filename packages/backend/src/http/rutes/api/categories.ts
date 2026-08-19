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

type AgrupacioRendiment = 'KG' | 'MAGRE' | 'PAQ';
const AGRUPACIONS_RENDIMENT: readonly AgrupacioRendiment[] = ['KG', 'MAGRE', 'PAQ'];

function esAgrupacioRendimentValida(valor: unknown): valor is AgrupacioRendiment {
  return typeof valor === 'string' && AGRUPACIONS_RENDIMENT.includes(valor as AgrupacioRendiment);
}

interface FilaCategoria {
  id_seq: string;
  nom: string;
  elaborat_porc: boolean;
  agrupacio_rendiment: AgrupacioRendiment | null;
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
      agrupacioRendiment: AgrupacioRendiment | null;
    }>;

    if (cos.nom !== undefined && cos.nom.trim() === '') {
      return enviarValidacio(reply, 'El nom no pot estar buit', [
        { camp: 'nom', missatge: 'no pot estar buit' },
      ]);
    }
    if (
      cos.agrupacioRendiment !== undefined &&
      cos.agrupacioRendiment !== null &&
      !esAgrupacioRendimentValida(cos.agrupacioRendiment)
    ) {
      return enviarValidacio(
        reply,
        `agrupacioRendiment ha de ser ${AGRUPACIONS_RENDIMENT.join(', ')} o null`,
        [
          {
            camp: 'agrupacioRendiment',
            missatge: `ha de ser ${AGRUPACIONS_RENDIMENT.join(', ')} o null`,
          },
        ],
      );
    }

    // Regla de negocio (no es un CHECK de base, ver migración 0011):
    // agrupacioRendiment sólo tiene sentido cuando elaboratPorc es true.
    // Hace falta el valor EFECTIVO tras este PATCH — si elaboratPorc no
    // viene en el cuerpo, se compara contra el actual; de paso, esta
    // consulta resuelve si la categoría existe.
    if (cos.agrupacioRendiment !== undefined && cos.agrupacioRendiment !== null) {
      const actual = await pool.query<{ elaborat_porc: boolean }>(
        'SELECT elaborat_porc FROM categoria_producte WHERE id_seq = $1',
        [idPublic],
      );
      if (!actual.rows[0]) return enviarNoTrobat(reply, 'Categoria no trobada');

      const elaboratPorcEfectiu = cos.elaboratPorc ?? actual.rows[0].elaborat_porc;
      if (!elaboratPorcEfectiu) {
        return enviarValidacio(
          reply,
          'agrupacioRendiment només es pot indicar quan elaboratPorc és true',
          [
            {
              camp: 'agrupacioRendiment',
              missatge: 'només aplica quan elaboratPorc és true',
            },
          ],
        );
      }
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
