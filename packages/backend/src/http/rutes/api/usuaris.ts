import type { UsuariApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import {
  construirPaginacio,
  enviarNoTrobat,
  enviarValidacio,
  parsearIdPublic,
  parsearPaginacio,
  resolverRolUuid,
} from './comu.js';

interface FilaUsuari {
  id_seq: string;
  firebase_uid: string;
  nom: string;
  email: string;
  actiu: boolean;
  rol_id_seq: string;
  rol_nom: string;
  rol_moduls_permesos: string[];
}

function aApi(fila: FilaUsuari): UsuariApi {
  return {
    id: Number(fila.id_seq),
    firebaseUid: fila.firebase_uid,
    nom: fila.nom,
    email: fila.email,
    rol: {
      id: Number(fila.rol_id_seq),
      nom: fila.rol_nom,
      modulsPermesos: fila.rol_moduls_permesos,
    },
    actiu: fila.actiu,
  };
}

const SELECT_USUARI = `
  SELECT u.id_seq, u.firebase_uid, u.nom, u.email, u.actiu,
         r.id_seq AS rol_id_seq, r.nom AS rol_nom, r.moduls_permesos AS rol_moduls_permesos
  FROM usuari u
  JOIN rol r ON r.id = u.rol_id
`;

export function registrarRutesUsuaris(fastify: FastifyInstance): void {
  // GET /jo: lo primero que llama el frontend después de loguearse (contrato,
  // sección 4.12) — el usuario ya viene resuelto por el middleware
  // (resoldre-usuari.ts, con auto-provisioning si es la primera vez que se
  // ve este uid), así que acá no hace falta ninguna consulta más.
  fastify.get('/jo', (req) => {
    const usuari = req.usuariResolt!;
    const api: UsuariApi = {
      id: usuari.id,
      firebaseUid: usuari.firebaseUid,
      nom: usuari.nom,
      email: usuari.email,
      rol: usuari.rol,
      actiu: usuari.actiu,
    };
    return api;
  });

  fastify.get('/usuaris', async (req) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    const condicions: string[] = [];
    const valors: unknown[] = [];

    if (query.actiu === 'true' || query.actiu === 'false') {
      condicions.push(`u.actiu = $${valors.length + 1}`);
      valors.push(query.actiu === 'true');
    }
    const where = condicions.length > 0 ? `WHERE ${condicions.join(' AND ')}` : '';

    const total = await pool.query<{ count: string }>(
      `SELECT count(*) FROM usuari u ${where}`,
      valors,
    );
    const files = await pool.query<FilaUsuari>(
      `${SELECT_USUARI} ${where} ORDER BY u.nom ASC LIMIT $${valors.length + 1} OFFSET $${valors.length + 2}`,
      [...valors, mida, offset],
    );

    return {
      dades: files.rows.map(aApi),
      paginacio: construirPaginacio(pagina, mida, Number(total.rows[0]?.count ?? 0)),
    };
  });

  fastify.patch('/usuaris/:id', async (req, reply) => {
    const idPublic = parsearIdPublic((req.params as { id: string }).id);
    if (idPublic === null) return enviarNoTrobat(reply);

    // firebaseUid i email són immutables un cop creat l'usuari — no es
    // llegeixen del cos encara que vinguin, no hi ha camp per a ells acà.
    const cos = req.body as Partial<{ nom: string; rolId: number; actiu: boolean }>;

    if (cos.nom !== undefined && cos.nom.trim() === '') {
      return enviarValidacio(reply, 'El nom no pot estar buit', [
        { camp: 'nom', missatge: 'no pot estar buit' },
      ]);
    }

    let rolUuid: string | undefined;
    if (cos.rolId !== undefined) {
      const uuid = await resolverRolUuid(pool, cos.rolId);
      if (uuid === null) {
        return enviarValidacio(reply, 'El rol indicat no existeix', [
          { camp: 'rolId', missatge: 'no existeix' },
        ]);
      }
      rolUuid = uuid;
    }

    const resultat = await pool.query<{ id: string }>(
      `UPDATE usuari SET
         nom = COALESCE($2, nom),
         rol_id = CASE WHEN $3 THEN $4 ELSE rol_id END,
         actiu = COALESCE($5, actiu)
       WHERE id_seq = $1
       RETURNING id`,
      [
        idPublic,
        cos.nom?.trim() ?? null,
        rolUuid !== undefined,
        rolUuid ?? null,
        cos.actiu ?? null,
      ],
    );
    if (!resultat.rows[0]) return enviarNoTrobat(reply, 'Usuari no trobat');

    const actualitzat = await pool.query<FilaUsuari>(`${SELECT_USUARI} WHERE u.id_seq = $1`, [
      idPublic,
    ]);
    return aApi(actualitzat.rows[0]!);
  });
}
