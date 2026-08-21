import type { FastifyReply, FastifyRequest } from 'fastify';
import { DatabaseError } from 'pg';
import type { Pool } from 'pg';
import { pool as poolPerDefecte } from '../db/pool.js';
import { cosError } from './error-api.js';

/**
 * Entidad de negocio (tabla `usuari`, capa 17) resuelta a partir del uid de
 * Firebase — distinta de `InfoUsuari` (auth-firebase.ts), que son sólo los
 * claims crudos del token. `rol.modulsPermesos` es lo que el FRONTEND usa
 * para decidir qué mostrar (ADR-021: ningún endpoint de negocio bloquea
 * todavía por rol).
 */
export interface UsuariResolt {
  id: number;
  firebaseUid: string;
  nom: string;
  email: string;
  rol: { id: number; nom: string; modulsPermesos: string[] };
  actiu: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuariResolt?: UsuariResolt;
  }
}

interface FilaUsuariAmbRol {
  id_seq: string;
  nom: string;
  email: string;
  actiu: boolean;
  rol_id_seq: string;
  rol_nom: string;
  rol_moduls_permesos: string[];
}

const SELECT_USUARI_AMB_ROL = `
  SELECT u.id_seq, u.nom, u.email, u.actiu,
         r.id_seq AS rol_id_seq, r.nom AS rol_nom, r.moduls_permesos AS rol_moduls_permesos
  FROM usuari u
  JOIN rol r ON r.id = u.rol_id
`;

function aUsuariResolt(firebaseUid: string, fila: FilaUsuariAmbRol): UsuariResolt {
  return {
    id: Number(fila.id_seq),
    firebaseUid,
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

/**
 * `preHandler` de Fastify — se registra DESPUÉS de `crearMiddlewareAuth()`
 * (ver servidor.ts) porque necesita `req.usuari` (el uid ya verificado) para
 * poder correr. Busca la fila de `usuari` para ese uid y la adjunta a
 * `req.usuariResolt`, con su rol y `modulsPermesos` ya resueltos.
 *
 * AUTO-PROVISIONING TEMPORAL: si no existe fila de `usuari` para este uid,
 * se crea acá mismo con el rol 'General' (decisión de producto: no
 * bloquear a nadie mientras no exista una pantalla de alta de usuarios en
 * el frontend). A propósito NO es 'Administrador': nadie debe obtener
 * gestión de usuarios/roles sólo por loguearse primero — eso se otorga a
 * mano, después, vía PATCH /usuaris/:id, por alguien que ya sea
 * Administrador. Revisar si hace falta desactivar el auto-provisioning
 * entero cuando exista alta manual de usuarios.
 */
export function crearMiddlewareResoldreUsuari(pool: Pool = poolPerDefecte) {
  return async function middlewareResoldreUsuari(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Garantizado por crearMiddlewareAuth(), que corre antes en el mismo
    // scope de plugin — si faltara, ya habría respondido 401.
    const info = req.usuari!;

    const existent = await pool.query<FilaUsuariAmbRol>(
      `${SELECT_USUARI_AMB_ROL} WHERE u.firebase_uid = $1`,
      [info.uid],
    );

    if (existent.rows[0]) {
      if (!existent.rows[0].actiu) {
        reply.code(403).send(cosError('SENSE_PERMIS', 'Usuari desactivat'));
        return;
      }
      req.usuariResolt = aUsuariResolt(info.uid, existent.rows[0]);
      return;
    }

    // Ni "name" (sólo algunos proveedores, ej. Google Sign-In) ni "email"
    // están garantizados en todo token — el uid es el último recurso para
    // que las columnas NOT NULL nunca reciban null.
    const email = info.email ?? `${info.uid}@dpages.local`;
    const nom = info.nom ?? email;

    try {
      const creat = await pool.query<FilaUsuariAmbRol>(
        `WITH nou AS (
           INSERT INTO usuari (firebase_uid, nom, email, rol_id)
           SELECT $1, $2, $3, r.id FROM rol r WHERE r.nom = 'General'
           RETURNING *
         )
         SELECT nou.id_seq, nou.nom, nou.email, nou.actiu,
                r.id_seq AS rol_id_seq, r.nom AS rol_nom, r.moduls_permesos AS rol_moduls_permesos
         FROM nou JOIN rol r ON r.id = nou.rol_id`,
        [info.uid, nom, email],
      );
      if (!creat.rows[0]) {
        throw new Error(
          `No se pudo auto-provisionar el usuario ${info.uid}: no existe el rol 'General' ` +
            `— falta correr la migración 0014.`,
        );
      }
      req.usuariResolt = aUsuariResolt(info.uid, creat.rows[0]);
    } catch (err) {
      // Carrera: otra petición concurrente para el mismo uid (nunca visto)
      // ya lo provisionó entre el SELECT de arriba y este INSERT — se relee
      // en vez de fallar con un 500 por un unique_violation esperable.
      if (err instanceof DatabaseError && err.code === '23505') {
        const relectura = await pool.query<FilaUsuariAmbRol>(
          `${SELECT_USUARI_AMB_ROL} WHERE u.firebase_uid = $1`,
          [info.uid],
        );
        if (relectura.rows[0]) {
          req.usuariResolt = aUsuariResolt(info.uid, relectura.rows[0]);
          return;
        }
      }
      throw err;
    }
  };
}
