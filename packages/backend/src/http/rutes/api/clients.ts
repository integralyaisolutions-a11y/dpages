import type { ClientApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import {
  construirPaginacio,
  enviarNoTrobat,
  enviarValidacio,
  parsearIdPublic,
  parsearPaginacio,
  resolverTarifaUuid,
  resolverTransportistaUuid,
} from './comu.js';

interface FilaClient {
  id_seq: string;
  codi: string | null;
  nom: string | null;
  nif: string | null;
  email: string | null;
  telefon: string | null;
  poblacio: string | null;
  actiu: boolean;
  tarifa_id_seq: string | null;
  tarifa_nom: string | null;
  transportista_id_seq: string | null;
  transportista_nom: string | null;
}

function aApi(fila: FilaClient): ClientApi {
  return {
    id: Number(fila.id_seq),
    codi: fila.codi,
    nom: fila.nom,
    nif: fila.nif,
    email: fila.email,
    telefon: fila.telefon,
    poblacio: fila.poblacio,
    tarifa:
      fila.tarifa_id_seq !== null && fila.tarifa_nom !== null
        ? { id: Number(fila.tarifa_id_seq), nom: fila.tarifa_nom }
        : null,
    transportistaDefecte:
      fila.transportista_id_seq !== null && fila.transportista_nom !== null
        ? { id: Number(fila.transportista_id_seq), nom: fila.transportista_nom }
        : null,
    actiu: fila.actiu,
  };
}

const SELECT_CLIENT = `
  SELECT cl.id_seq, cl.codi, cl.nom, cl.nif, cl.email, cl.telefon, cl.poblacio, cl.actiu,
         t.id_seq AS tarifa_id_seq, t.nom AS tarifa_nom,
         tr.id_seq AS transportista_id_seq, tr.nom AS transportista_nom
  FROM client cl
  LEFT JOIN tarifa t ON t.id = cl.tarifa_id
  LEFT JOIN transportista tr ON tr.id = cl.transportista_defecte_id
`;

export function registrarRutesClients(fastify: FastifyInstance): void {
  fastify.get('/clients', async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    const condicions: string[] = [];
    const valors: unknown[] = [];

    if (typeof query.cerca === 'string' && query.cerca.trim() !== '') {
      condicions.push(
        `(cl.nom ILIKE $${valors.length + 1} OR cl.codi ILIKE $${valors.length + 1})`,
      );
      valors.push(`%${query.cerca.trim()}%`);
    }
    if (typeof query.tarifaId === 'string') {
      const tarifaIdPublic = parsearIdPublic(query.tarifaId);
      if (tarifaIdPublic === null) return enviarValidacio(reply, 'tarifaId ha de ser un enter');
      const tarifaUuid = await resolverTarifaUuid(pool, tarifaIdPublic);
      condicions.push(`cl.tarifa_id = $${valors.length + 1}`);
      valors.push(tarifaUuid ?? '00000000-0000-0000-0000-000000000000');
    }
    if (query.actiu === 'true' || query.actiu === 'false') {
      condicions.push(`cl.actiu = $${valors.length + 1}`);
      valors.push(query.actiu === 'true');
    }
    const where = condicions.length > 0 ? `WHERE ${condicions.join(' AND ')}` : '';

    const total = await pool.query<{ count: string }>(
      `SELECT count(*) FROM client cl ${where}`,
      valors,
    );
    const files = await pool.query<FilaClient>(
      `${SELECT_CLIENT} ${where} ORDER BY cl.nom ASC NULLS LAST LIMIT $${valors.length + 1} OFFSET $${valors.length + 2}`,
      [...valors, mida, offset],
    );

    return {
      dades: files.rows.map(aApi),
      paginacio: construirPaginacio(pagina, mida, Number(total.rows[0]?.count ?? 0)),
    };
  });

  fastify.patch('/clients/:id', async (req, reply) => {
    const idPublic = parsearIdPublic((req.params as { id: string }).id);
    if (idPublic === null) return enviarNoTrobat(reply);

    const cos = req.body as Partial<{
      codi: string | null;
      nom: string | null;
      nif: string | null;
      email: string | null;
      telefon: string | null;
      poblacio: string | null;
      tarifaId: number | null;
      transportistaDefecteId: number | null;
      actiu: boolean;
    }>;

    let tarifaUuid: string | null | undefined;
    if (cos.tarifaId !== undefined) {
      if (cos.tarifaId === null) {
        tarifaUuid = null;
      } else {
        tarifaUuid = await resolverTarifaUuid(pool, cos.tarifaId);
        if (tarifaUuid === null) {
          return enviarValidacio(reply, 'La tarifa indicada no existeix', [
            { camp: 'tarifaId', missatge: 'no existeix' },
          ]);
        }
      }
    }

    let transportistaUuid: string | null | undefined;
    if (cos.transportistaDefecteId !== undefined) {
      if (cos.transportistaDefecteId === null) {
        transportistaUuid = null;
      } else {
        transportistaUuid = await resolverTransportistaUuid(pool, cos.transportistaDefecteId);
        if (transportistaUuid === null) {
          return enviarValidacio(reply, 'El transportista indicat no existeix', [
            { camp: 'transportistaDefecteId', missatge: 'no existeix' },
          ]);
        }
      }
    }

    const resultat = await pool.query<{ id: string }>(
      `UPDATE client SET
         codi = CASE WHEN $2 THEN $3 ELSE codi END,
         nom = CASE WHEN $4 THEN $5 ELSE nom END,
         nif = CASE WHEN $6 THEN $7 ELSE nif END,
         email = CASE WHEN $8 THEN $9 ELSE email END,
         telefon = CASE WHEN $10 THEN $11 ELSE telefon END,
         poblacio = CASE WHEN $12 THEN $13 ELSE poblacio END,
         tarifa_id = CASE WHEN $14 THEN $15 ELSE tarifa_id END,
         transportista_defecte_id = CASE WHEN $16 THEN $17 ELSE transportista_defecte_id END,
         actiu = COALESCE($18, actiu)
       WHERE id_seq = $1
       RETURNING id`,
      [
        idPublic,
        cos.codi !== undefined,
        cos.codi ?? null,
        cos.nom !== undefined,
        cos.nom ?? null,
        cos.nif !== undefined,
        cos.nif ?? null,
        cos.email !== undefined,
        cos.email ?? null,
        cos.telefon !== undefined,
        cos.telefon ?? null,
        cos.poblacio !== undefined,
        cos.poblacio ?? null,
        tarifaUuid !== undefined,
        tarifaUuid ?? null,
        transportistaUuid !== undefined,
        transportistaUuid ?? null,
        cos.actiu ?? null,
      ],
    );

    if (!resultat.rows[0]) return enviarNoTrobat(reply, 'Client no trobat');

    const actualitzat = await pool.query<FilaClient>(`${SELECT_CLIENT} WHERE cl.id_seq = $1`, [
      idPublic,
    ]);
    return aApi(actualitzat.rows[0]!);
  });
}
