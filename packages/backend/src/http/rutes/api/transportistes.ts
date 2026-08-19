import type { TransportistaApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import { construirPaginacio, parsearPaginacio } from './comu.js';

interface FilaTransportista {
  id_seq: string;
  codi: string | null;
  nom: string;
  actiu: boolean;
}

function aApi(fila: FilaTransportista): TransportistaApi {
  return { id: Number(fila.id_seq), codi: fila.codi, nom: fila.nom, actiu: fila.actiu };
}

export function registrarRutesTransportistes(fastify: FastifyInstance): void {
  fastify.get('/transportistes', async (req) => {
    const { pagina, mida, offset } = parsearPaginacio(req.query as Record<string, unknown>);

    const total = await pool.query<{ count: string }>('SELECT count(*) FROM transportista');
    const files = await pool.query<FilaTransportista>(
      'SELECT id_seq, codi, nom, actiu FROM transportista ORDER BY nom ASC LIMIT $1 OFFSET $2',
      [mida, offset],
    );

    return {
      dades: files.rows.map(aApi),
      paginacio: construirPaginacio(pagina, mida, Number(total.rows[0]?.count ?? 0)),
    };
  });
}
