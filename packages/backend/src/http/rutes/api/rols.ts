import type { RolApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import {
  crearGuardaModul,
  enviarConflicte,
  enviarNoTrobat,
  enviarValidacio,
  parsearIdPublic,
  resolverRolUuid,
} from './comu.js';

/**
 * Capa 39 — única lista de módulos válidos del sistema. Auditada contra el
 * código antes de escribir el validador (no hardcodeada a ciegas):
 * - Única fuente real: migración 0014 (`INSERT INTO rol ...`), que siembra
 *   'Administrador' con estos 12 y 'General' con los mismos MENOS
 *   'usuaris'/'rols'. `seed-arranque.ts` no siembra roles — sólo
 *   categorías/orígenes de pedido.
 * - El frontend (`Sidebar.tsx`/`lib/roles.ts`, `MODUL_ROUTES`) tiene el
 *   mismo conjunto MENOS 'rols' — todavía no existe una pantalla de gestión
 *   de roles, así que ese módulo no tiene ruta que mostrar/ocultar, pero
 *   sigue siendo un valor válido de permiso (gatea `POST`/`PATCH`/
 *   `DELETE /rols` — ver más abajo).
 */
const MODULS_VALIDS = [
  'categories',
  'catalog',
  'tarifes',
  'tarifes-clients',
  'comandes',
  'rendiments-porcs',
  'panell-oficina',
  'panell-obrador',
  'panell-empaquetat',
  'panell-produccio',
  'usuaris',
  'rols',
] as const;

/** Elementos de `modulsPermesos` que no están en `MODULS_VALIDS` — vacío si todos son válidos. */
function modulsInvalids(modulsPermesos: string[]): string[] {
  return modulsPermesos.filter((m) => !(MODULS_VALIDS as readonly string[]).includes(m));
}

interface FilaRol {
  id_seq: string;
  nom: string;
  moduls_permesos: string[];
}

function aApi(fila: FilaRol): RolApi {
  return { id: Number(fila.id_seq), nom: fila.nom, modulsPermesos: fila.moduls_permesos };
}

/**
 * Valida el shape de `modulsPermesos` en el body (POST/PATCH): debe ser un
 * array de strings, y cada string debe estar en `MODULS_VALIDS`. Devuelve
 * el mensaje de error a enviar, o `null` si es válido (o no vino, es
 * opcional en los dos endpoints).
 */
function validarModulsPermesos(
  modulsPermesos: unknown,
): { missatge: string; detalls: { camp: string; missatge: string }[] } | null {
  if (modulsPermesos === undefined) return null;
  if (!Array.isArray(modulsPermesos) || !modulsPermesos.every((m) => typeof m === 'string')) {
    return {
      missatge: 'modulsPermesos ha de ser una llista de text',
      detalls: [{ camp: 'modulsPermesos', missatge: 'ha de ser una llista de text' }],
    };
  }
  const invalids = modulsInvalids(modulsPermesos);
  if (invalids.length > 0) {
    return {
      missatge: `Mòduls no vàlids: ${invalids.join(', ')}`,
      detalls: [
        {
          camp: 'modulsPermesos',
          missatge: `valors no vàlids: ${invalids.join(', ')} — vàlids: ${MODULS_VALIDS.join(', ')}`,
        },
      ],
    };
  }
  return null;
}

export function registrarRutesRols(fastify: FastifyInstance): void {
  fastify.get('/rols', async () => {
    const files = await pool.query<FilaRol>(
      'SELECT id_seq, nom, moduls_permesos FROM rol ORDER BY nom ASC',
    );
    return { dades: files.rows.map(aApi) };
  });

  // Capa 39 — agujero de seguridad: hasta esta capa, POST/PATCH/DELETE
  // /rols no tenían NINGÚN guard — cualquier usuario autenticado podía
  // crear/editar/borrar roles, incluido agregarse 'usuaris'/'rols' a su
  // propio rol. Mismo guard que ya usaba POST /usuaris (crearGuardaModul,
  // ver comu.ts) — reusado tal cual, sin duplicar la lógica de chequeo.
  fastify.post('/rols', { preHandler: crearGuardaModul('usuaris') }, async (req, reply) => {
    const cos = req.body as Partial<{ nom: string; modulsPermesos: string[] }>;

    if (!cos.nom || cos.nom.trim() === '') {
      return enviarValidacio(reply, 'El nom és obligatori', [
        { camp: 'nom', missatge: 'és obligatori' },
      ]);
    }
    const errorModuls = validarModulsPermesos(cos.modulsPermesos);
    if (errorModuls) {
      return enviarValidacio(reply, errorModuls.missatge, errorModuls.detalls);
    }

    const inserit = await pool.query<FilaRol>(
      `INSERT INTO rol (nom, moduls_permesos) VALUES ($1, $2)
       RETURNING id_seq, nom, moduls_permesos`,
      [cos.nom.trim(), cos.modulsPermesos ?? []],
    );

    reply.code(201);
    return aApi(inserit.rows[0]!);
  });

  fastify.patch('/rols/:id', { preHandler: crearGuardaModul('usuaris') }, async (req, reply) => {
    const idPublic = parsearIdPublic((req.params as { id: string }).id);
    if (idPublic === null) return enviarNoTrobat(reply);

    const cos = req.body as Partial<{ nom: string; modulsPermesos: string[] }>;

    if (cos.nom !== undefined && cos.nom.trim() === '') {
      return enviarValidacio(reply, 'El nom no pot estar buit', [
        { camp: 'nom', missatge: 'no pot estar buit' },
      ]);
    }
    const errorModuls = validarModulsPermesos(cos.modulsPermesos);
    if (errorModuls) {
      return enviarValidacio(reply, errorModuls.missatge, errorModuls.detalls);
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

  // Capa 39 — no existía. Mismo guard que arriba; mismo patrón de guarda de
  // integridad que DELETE /categories/:id (categories.ts): cualquier
  // usuario con este rol asignado bloquea el borrado — nunca se permite
  // borrar un rol en uso.
  fastify.delete('/rols/:id', { preHandler: crearGuardaModul('usuaris') }, async (req, reply) => {
    const idPublic = parsearIdPublic((req.params as { id: string }).id);
    if (idPublic === null) return enviarNoTrobat(reply);

    const rolUuid = await resolverRolUuid(pool, idPublic);
    if (rolUuid === null) return enviarNoTrobat(reply, 'Rol no trobat');

    const enUs = await pool.query<{ count: string }>(
      'SELECT count(*) FROM usuari WHERE rol_id = $1',
      [rolUuid],
    );
    const total = Number(enUs.rows[0]?.count ?? 0);
    if (total > 0) {
      return enviarConflicte(
        reply,
        `No es pot eliminar: ${total} usuari(s) tenen aquest rol assignat`,
      );
    }

    await pool.query('DELETE FROM rol WHERE id_seq = $1', [idPublic]);
    reply.code(204);
  });
}
