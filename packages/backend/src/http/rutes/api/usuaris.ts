import type { UsuariApi, UsuariCreatRespostaApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { pool } from '../../../db/pool.js';
import { gestioUsuarisFirebase } from '../../auth-firebase.js';
import type { GestioUsuarisFirebase } from '../../auth-firebase.js';
import {
  construirPaginacio,
  crearGuardaModul,
  enviarConflicte,
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

export type ResultatCreacioUsuari =
  | { tipus: 'ok'; usuari: UsuariApi; linkEstabliment: string }
  | { tipus: 'validacio'; missatge: string; detalls?: { camp: string; missatge: string }[] }
  | { tipus: 'conflicte'; missatge: string };

/**
 * Alta manual de usuarios (capa 19) — pura respecto de Fastify (recibe
 * `pool`/`gestioFirebase` en vez de leerlos de un módulo), para poder
 * testearla sin levantar el servidor ni pegarle a Firebase real (ver
 * usuaris.test.ts). El endpoint (`registrarRutesUsuaris` más abajo) es un
 * envoltorio delgado que traduce el resultado a la respuesta HTTP.
 *
 * Si algo falla DESPUÉS de crear el usuario en Firebase (el INSERT local o
 * generar el link), se revierte borrándolo de Firebase antes de propagar
 * el error — nunca queda un usuario huérfano allá sin registro acá.
 */
export async function crearUsuariAmbLink(
  dbPool: Pool,
  gestioFirebase: GestioUsuarisFirebase,
  cos: Partial<{ nom: string; email: string; rolId: number }>,
): Promise<ResultatCreacioUsuari> {
  const detalls: { camp: string; missatge: string }[] = [];
  if (!cos.nom || cos.nom.trim() === '') detalls.push({ camp: 'nom', missatge: 'és obligatori' });
  if (!cos.email || cos.email.trim() === '') {
    detalls.push({ camp: 'email', missatge: 'és obligatori' });
  }
  if (cos.rolId === undefined) detalls.push({ camp: 'rolId', missatge: 'és obligatori' });
  if (detalls.length > 0) {
    return { tipus: 'validacio', missatge: 'Falten dades obligatòries', detalls };
  }

  const rolUuid = await resolverRolUuid(dbPool, cos.rolId!);
  if (rolUuid === null) {
    return {
      tipus: 'validacio',
      missatge: 'El rol indicat no existeix',
      detalls: [{ camp: 'rolId', missatge: 'no existeix' }],
    };
  }

  const email = cos.email!.trim();
  const nom = cos.nom!.trim();
  const existent = await dbPool.query<{ id: string }>('SELECT id FROM usuari WHERE email = $1', [
    email,
  ]);
  if (existent.rows[0]) {
    return { tipus: 'conflicte', missatge: `Ja existeix un usuari amb l'email "${email}"` };
  }

  const { uid } = await gestioFirebase.crearUsuari(email);

  // Transacción: el INSERT local sólo queda firme si generar el link
  // también funciona — si cualquiera de los dos falla, ROLLBACK deshace
  // el INSERT y el catch de afuera borra el usuario de Firebase. Sin esto,
  // un fallo al generar el link (después de un INSERT ya confirmado)
  // dejaría el problema inverso al que se quiere evitar: una fila local
  // con firebase_uid apuntando a un usuario que ya no existe en Firebase.
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const inserit = await client.query<FilaUsuari>(
      `WITH nou AS (
         INSERT INTO usuari (firebase_uid, nom, email, rol_id, actiu)
         VALUES ($1, $2, $3, $4, true)
         RETURNING *
       )
       SELECT nou.id_seq, nou.firebase_uid, nou.nom, nou.email, nou.actiu,
              r.id_seq AS rol_id_seq, r.nom AS rol_nom, r.moduls_permesos AS rol_moduls_permesos
       FROM nou JOIN rol r ON r.id = nou.rol_id`,
      [uid, nom, email, rolUuid],
    );
    const linkEstabliment = await gestioFirebase.generarLinkEstabliment(email);
    await client.query('COMMIT');

    return { tipus: 'ok', usuari: aApi(inserit.rows[0]!), linkEstabliment };
  } catch (err) {
    await client.query('ROLLBACK');
    await gestioFirebase.esborrarUsuari(uid);
    throw err;
  } finally {
    client.release();
  }
}

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

  // Sólo Administrador (o cualquier rol con 'usuaris' en modulsPermesos) —
  // primer endpoint que restringe por módulo, ver crearGuardaModul en
  // comu.ts. No hay envío de email: linkEstabliment se devuelve en la
  // respuesta para que quien da de alta lo comparta a mano.
  fastify.post('/usuaris', { preHandler: crearGuardaModul('usuaris') }, async (req, reply) => {
    const resultat = await crearUsuariAmbLink(
      pool,
      gestioUsuarisFirebase,
      req.body as Partial<{ nom: string; email: string; rolId: number }>,
    );

    if (resultat.tipus === 'validacio') {
      return enviarValidacio(reply, resultat.missatge, resultat.detalls);
    }
    if (resultat.tipus === 'conflicte') {
      return enviarConflicte(reply, resultat.missatge);
    }

    reply.code(201);
    const resposta: UsuariCreatRespostaApi = {
      usuari: resultat.usuari,
      linkEstabliment: resultat.linkEstabliment,
    };
    return resposta;
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
