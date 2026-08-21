import type { RolApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import { enviarNoTrobat, enviarValidacio, parsearIdPublic } from './comu.js';

interface FilaRol {
  id_seq: string;
  nom: string;
  moduls_permesos: string[];
}

function aApi(fila: FilaRol): RolApi {
  return { id: Number(fila.id_seq), nom: fila.nom, modulsPermesos: fila.moduls_permesos };
}

export function registrarRutesRols(fastify: FastifyInstance): void {
  fastify.get('/rols', async () => {
    const files = await pool.query<FilaRol>(
      'SELECT id_seq, nom, moduls_permesos FROM rol ORDER BY nom ASC',
    );
    return { dades: files.rows.map(aApi) };
  });

  fastify.post('/rols', async (req, reply) => {
    const cos = req.body as Partial<{ nom: string; modulsPermesos: string[] }>;

    if (!cos.nom || cos.nom.trim() === '') {
      return enviarValidacio(reply, 'El nom és obligatori', [
        { camp: 'nom', missatge: 'és obligatori' },
      ]);
    }
    if (cos.modulsPermesos !== undefined && !Array.isArray(cos.modulsPermesos)) {
      return enviarValidacio(reply, 'modulsPermesos ha de ser una llista de text', [
        { camp: 'modulsPermesos', missatge: 'ha de ser una llista de text' },
      ]);
    }

    const inserit = await pool.query<FilaRol>(
      `INSERT INTO rol (nom, moduls_permesos) VALUES ($1, $2)
       RETURNING id_seq, nom, moduls_permesos`,
      [cos.nom.trim(), cos.modulsPermesos ?? []],
    );

    reply.code(201);
    return aApi(inserit.rows[0]!);
  });

  fastify.patch('/rols/:id', async (req, reply) => {
    const idPublic = parsearIdPublic((req.params as { id: string }).id);
    if (idPublic === null) return enviarNoTrobat(reply);

    const cos = req.body as Partial<{ nom: string; modulsPermesos: string[] }>;

    if (cos.nom !== undefined && cos.nom.trim() === '') {
      return enviarValidacio(reply, 'El nom no pot estar buit', [
        { camp: 'nom', missatge: 'no pot estar buit' },
      ]);
    }
    if (cos.modulsPermesos !== undefined && !Array.isArray(cos.modulsPermesos)) {
      return enviarValidacio(reply, 'modulsPermesos ha de ser una llista de text', [
        { camp: 'modulsPermesos', missatge: 'ha de ser una llista de text' },
      ]);
    }

    const resultat = await pool.query<FilaRol>(
      `UPDATE rol SET
         nom = COALESCE($2, nom),
         moduls_permesos = COALESCE($3, moduls_permesos)
       WHERE id_seq = $1
       RETURNING id_seq, nom, moduls_permesos`,
      [idPublic, cos.nom?.trim() ?? null, cos.modulsPermesos ?? null],
    );

    if (!resultat.rows[0]) return enviarNoTrobat(reply, 'Rol no trobat');
    return aApi(resultat.rows[0]);
  });
}
