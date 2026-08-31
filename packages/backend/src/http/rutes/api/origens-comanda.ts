import type { OrigenComandaApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import {
  construirPaginacio,
  crearGuardaModul,
  enviarConflicte,
  enviarNoTrobat,
  enviarValidacio,
  esViolacioCodiUnic,
  parsearIdPublic,
  parsearPaginacio,
} from './comu.js';

interface FilaOrigenComanda {
  id_seq: string;
  codi: string;
  nom: string;
  actiu: boolean;
}

function aApi(fila: FilaOrigenComanda): OrigenComandaApi {
  return { id: Number(fila.id_seq), codi: fila.codi, nom: fila.nom, actiu: fila.actiu };
}

/**
 * Capa 43 — CRUD de origen_comanda (mismo patrón que transportistes.ts):
 * GET sin guard, POST/PATCH exigen el mòdul "comandes" (crearGuardaModul,
 * reusado de capa 39) — origen_comanda alimenta directamente el alta manual
 * de pedidos, mismo dominio que "comandes", no amerita un mòdul propio.
 * Sin DELETE (mismo criterio que /transportistes y que /usuaris, capa 39):
 * borrar de verdad podría dejar comanda.origen_id apuntando a nada — para
 * dar de baja un origen, PATCH { actiu: false }.
 */
export function registrarRutesOrigensComanda(fastify: FastifyInstance): void {
  fastify.get('/origens-comanda', async (req) => {
    const { pagina, mida, offset } = parsearPaginacio(req.query as Record<string, unknown>);

    const total = await pool.query<{ count: string }>('SELECT count(*) FROM origen_comanda');
    const files = await pool.query<FilaOrigenComanda>(
      'SELECT id_seq, codi, nom, actiu FROM origen_comanda ORDER BY nom ASC LIMIT $1 OFFSET $2',
      [mida, offset],
    );

    return {
      dades: files.rows.map(aApi),
      paginacio: construirPaginacio(pagina, mida, Number(total.rows[0]?.count ?? 0)),
    };
  });

  fastify.post(
    '/origens-comanda',
    { preHandler: crearGuardaModul('comandes') },
    async (req, reply) => {
      const cos = req.body as Partial<{ codi: string; nom: string; actiu: boolean }>;

      if (!cos.codi || cos.codi.trim() === '') {
        return enviarValidacio(reply, 'El codi és obligatori', [
          { camp: 'codi', missatge: 'és obligatori' },
        ]);
      }
      if (!cos.nom || cos.nom.trim() === '') {
        return enviarValidacio(reply, 'El nom és obligatori', [
          { camp: 'nom', missatge: 'és obligatori' },
        ]);
      }

      try {
        const inserit = await pool.query<FilaOrigenComanda>(
          `INSERT INTO origen_comanda (codi, nom, actiu) VALUES ($1, $2, $3)
           RETURNING id_seq, codi, nom, actiu`,
          [cos.codi.trim(), cos.nom.trim(), cos.actiu ?? true],
        );
        reply.code(201);
        return aApi(inserit.rows[0]!);
      } catch (err) {
        if (esViolacioCodiUnic(err)) {
          return enviarConflicte(reply, `Ja existeix un origen amb el codi "${cos.codi}"`);
        }
        throw err;
      }
    },
  );

  fastify.patch(
    '/origens-comanda/:id',
    { preHandler: crearGuardaModul('comandes') },
    async (req, reply) => {
      const idPublic = parsearIdPublic((req.params as { id: string }).id);
      if (idPublic === null) return enviarNoTrobat(reply);

      // codi és immutable un cop creat (contrato, sección 4.11) — no es
      // llegeix del cos encara que vingui, no hi ha camp per a ell acà.
      const cos = req.body as Partial<{ nom: string; actiu: boolean }>;

      if (cos.nom !== undefined && cos.nom.trim() === '') {
        return enviarValidacio(reply, 'El nom no pot estar buit', [
          { camp: 'nom', missatge: 'no pot estar buit' },
        ]);
      }

      const resultat = await pool.query<FilaOrigenComanda>(
        `UPDATE origen_comanda SET
           nom = COALESCE($2, nom),
           actiu = COALESCE($3, actiu)
         WHERE id_seq = $1
         RETURNING id_seq, codi, nom, actiu`,
        [idPublic, cos.nom?.trim() ?? null, cos.actiu ?? null],
      );
      if (!resultat.rows[0]) return enviarNoTrobat(reply, 'Origen no trobat');
      return aApi(resultat.rows[0]);
    },
  );
}
