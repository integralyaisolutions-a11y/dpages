import type { ComandaDetallApi, ComandaLiniaApi, ComandaResumApi } from '@dpages/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { pool } from '../../../db/pool.js';
import {
  construirPaginacio,
  enviarConflicte,
  enviarNoTrobat,
  enviarValidacio,
  formatearDataApi,
  parsearIdPublic,
  parsearPaginacio,
  resolverClientUuid,
  resolverComandaUuid,
  resolverTarifaUuid,
  resolverTransportistaUuid,
} from './comu.js';

interface FilaComandaResum {
  id_seq: string;
  num: string;
  origen: string;
  estat: string;
  client_id_seq: string | null;
  client_nom: string | null;
  client_poblacio: string | null;
  tarifa_id_seq: string | null;
  tarifa_nom: string | null;
  transportista_id_seq: string | null;
  transportista_nom: string | null;
  poblacio_desti: string | null;
  data_comanda: Date;
  data_produccio: Date | null;
  data_expedicio: Date | null;
  data_lliurament: Date | null;
  bultos: number | null;
  congelat_a: Date | null;
  obs_produccio: string | null;
  obs_lliurament: string | null;
  total_linies: string;
  total_kg: string;
  total_eur: string;
}

function aApiResum(fila: FilaComandaResum): ComandaResumApi {
  return {
    id: Number(fila.id_seq),
    num: fila.num,
    origen: fila.origen,
    estat: fila.estat,
    client:
      fila.client_id_seq !== null && fila.client_nom !== null
        ? { id: Number(fila.client_id_seq), nom: fila.client_nom, poblacio: fila.client_poblacio }
        : null,
    tarifa:
      fila.tarifa_id_seq !== null && fila.tarifa_nom !== null
        ? { id: Number(fila.tarifa_id_seq), nom: fila.tarifa_nom }
        : null,
    transportista:
      fila.transportista_id_seq !== null && fila.transportista_nom !== null
        ? { id: Number(fila.transportista_id_seq), nom: fila.transportista_nom }
        : null,
    poblacioDesti: fila.poblacio_desti,
    dataComanda: formatearDataApi(fila.data_comanda)!,
    dataProduccio: formatearDataApi(fila.data_produccio),
    dataExpedicio: formatearDataApi(fila.data_expedicio),
    dataLliurament: formatearDataApi(fila.data_lliurament),
    bultos: fila.bultos,
    totalLinies: Number(fila.total_linies),
    totalKg: fila.total_kg,
    totalEur: fila.total_eur,
    congelada: fila.congelat_a !== null,
  };
}

// data_comanda = comanda.creat_en (cuándo entró al sistema): para pedidos web es
// prácticamente el momento real del pedido (sync casi en tiempo real); para los
// capturados a mano (email/WhatsApp/teléfono) es exactamente ese momento. No hay
// ninguna otra columna que represente mejor "cuándo se hizo el pedido".
const SELECT_COMANDA_RESUM = `
  SELECT c.id_seq, c.num, c.origen, c.estat,
         cl.id_seq AS client_id_seq, cl.nom AS client_nom, cl.poblacio AS client_poblacio,
         t.id_seq AS tarifa_id_seq, t.nom AS tarifa_nom,
         tr.id_seq AS transportista_id_seq, tr.nom AS transportista_nom,
         c.poblacio_desti, c.creat_en AS data_comanda, c.data_produccio, c.data_expedicio,
         c.data_lliurament, c.bultos, c.congelat_a, c.obs_produccio, c.obs_lliurament,
         COALESCE(agg.total_linies, 0) AS total_linies,
         COALESCE(agg.total_kg, 0)::numeric(14,3) AS total_kg,
         COALESCE(agg.total_eur, 0)::numeric(14,2) AS total_eur
  FROM comanda c
  LEFT JOIN client cl ON cl.id = c.client_id
  LEFT JOIN tarifa t ON t.id = c.tarifa_id
  LEFT JOIN transportista tr ON tr.id = c.transportista_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS total_linies, SUM(pes_calculat_kg) AS total_kg,
           SUM(unitats_demanades * preu_unitari) AS total_eur
    FROM comanda_linia WHERE comanda_id = c.id AND NOT esborrat
  ) agg ON true
`;

interface FilaComandaLinia {
  id_seq: string;
  ordinal: number;
  producte_id_seq: string | null;
  producte_codi: string | null;
  producte_descripcio: string | null;
  unitats_demanades: number;
  kg_demanats: string;
  pes_editable: boolean;
  unitats_lliurades: number;
  kg_lliurats: string;
  confirmat_a: Date | null;
  preu_unitari: string;
  total_linia: string;
  obs_produccio: string | null;
  esborrat: boolean;
}

function aApiLinia(fila: FilaComandaLinia): ComandaLiniaApi {
  return {
    id: Number(fila.id_seq),
    ordinal: fila.ordinal,
    producte:
      fila.producte_id_seq !== null && fila.producte_descripcio !== null
        ? {
            id: Number(fila.producte_id_seq),
            codi: fila.producte_codi,
            descripcio: fila.producte_descripcio,
          }
        : null,
    unitatsDemanades: fila.unitats_demanades,
    kgDemanats: fila.kg_demanats,
    kgEditable: fila.pes_editable,
    unitatsLliurades: fila.unitats_lliurades,
    kgLliurats: fila.kg_lliurats,
    confirmatA: formatearDataApi(fila.confirmat_a),
    preuUnitari: fila.preu_unitari,
    totalLinia: fila.total_linia,
    obsProduccio: fila.obs_produccio,
    esborrat: fila.esborrat,
  };
}

const SELECT_COMANDA_LINIA = `
  SELECT cl.id_seq, cl.ordinal, p.id_seq AS producte_id_seq, p.codi AS producte_codi,
         p.descripcio AS producte_descripcio, cl.unitats_demanades, cl.pes_calculat_kg AS kg_demanats,
         cl.pes_editable, cl.unitats_lliurades, cl.kg_lliurats, cl.confirmat_a, cl.preu_unitari,
         (cl.unitats_demanades * cl.preu_unitari)::numeric(14,2) AS total_linia,
         cl.obs_produccio, cl.esborrat
  FROM comanda_linia cl
  LEFT JOIN producte p ON p.id = cl.producte_id
  WHERE cl.comanda_id = $1
  ORDER BY cl.ordinal ASC
`;

/** Detalle completo (cabecera + líneas) por UUID interno — usado por GET/POST/PATCH para no repetir la misma consulta tres veces. */
async function carregarDetallPerUuid(comandaUuid: string): Promise<ComandaDetallApi> {
  const cap = await pool.query<FilaComandaResum>(`${SELECT_COMANDA_RESUM} WHERE c.id = $1`, [
    comandaUuid,
  ]);
  const linies = await pool.query<FilaComandaLinia>(SELECT_COMANDA_LINIA, [comandaUuid]);
  const fila = cap.rows[0]!;
  const { totalLinies: _totalLinies, ...resum } = aApiResum(fila);
  return {
    ...resum,
    obsProduccio: fila.obs_produccio,
    obsLliurament: fila.obs_lliurament,
    congelatA: formatearDataApi(fila.congelat_a),
    linies: linies.rows.map(aApiLinia),
  };
}

/** 409 CONFLICTE si está congelada (contrato, sección 4.5) — se llama antes de cualquier UPDATE/DELETE. */
async function estaCongelada(dbPool: Pool, comandaUuid: string): Promise<boolean> {
  const res = await dbPool.query<{ congelat_a: Date | null }>(
    'SELECT congelat_a FROM comanda WHERE id = $1',
    [comandaUuid],
  );
  return res.rows[0]?.congelat_a !== null && res.rows[0]?.congelat_a !== undefined;
}

async function resolverComandaOResponder(
  reply: FastifyReply,
  idParam: string,
): Promise<string | null> {
  const idPublic = parsearIdPublic(idParam);
  if (idPublic === null) {
    enviarNoTrobat(reply, 'Comanda no trobada');
    return null;
  }
  const uuid = await resolverComandaUuid(pool, idPublic);
  if (uuid === null) {
    enviarNoTrobat(reply, 'Comanda no trobada');
    return null;
  }
  return uuid;
}

export function registrarRutesComandes(fastify: FastifyInstance): void {
  fastify.get('/comandes', async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    const condicions: string[] = [];
    const valors: unknown[] = [];

    if (typeof query.estat === 'string' && query.estat !== '') {
      condicions.push(`c.estat = $${valors.length + 1}`);
      valors.push(query.estat);
    }
    if (typeof query.origen === 'string' && query.origen !== '') {
      condicions.push(`c.origen = $${valors.length + 1}`);
      valors.push(query.origen);
    }
    if (typeof query.clientId === 'string') {
      const clientIdPublic = parsearIdPublic(query.clientId);
      if (clientIdPublic === null) return enviarValidacio(reply, 'clientId ha de ser un enter');
      const clientUuid = await resolverClientUuid(pool, clientIdPublic);
      condicions.push(`c.client_id = $${valors.length + 1}`);
      valors.push(clientUuid ?? '00000000-0000-0000-0000-000000000000');
    }
    if (typeof query.dataDes === 'string' && query.dataDes !== '') {
      condicions.push(`c.creat_en >= $${valors.length + 1}`);
      valors.push(query.dataDes);
    }
    if (typeof query.dataFins === 'string' && query.dataFins !== '') {
      condicions.push(`c.creat_en <= $${valors.length + 1}`);
      valors.push(query.dataFins);
    }
    if (typeof query.cerca === 'string' && query.cerca.trim() !== '') {
      condicions.push(`c.num ILIKE $${valors.length + 1}`);
      valors.push(`%${query.cerca.trim()}%`);
    }
    const where = condicions.length > 0 ? `WHERE ${condicions.join(' AND ')}` : '';

    const total = await pool.query<{ count: string }>(
      `SELECT count(*) FROM comanda c ${where}`,
      valors,
    );
    const files = await pool.query<FilaComandaResum>(
      `${SELECT_COMANDA_RESUM} ${where} ORDER BY c.creat_en DESC LIMIT $${valors.length + 1} OFFSET $${valors.length + 2}`,
      [...valors, mida, offset],
    );

    return {
      dades: files.rows.map(aApiResum),
      paginacio: construirPaginacio(pagina, mida, Number(total.rows[0]?.count ?? 0)),
    };
  });

  fastify.get('/comandes/:id', async (req, reply) => {
    const comandaUuid = await resolverComandaOResponder(reply, (req.params as { id: string }).id);
    if (comandaUuid === null) return;
    return carregarDetallPerUuid(comandaUuid);
  });

  fastify.post('/comandes', async (req, reply) => {
    const cos = req.body as Partial<{
      origen: string;
      clientId: number;
      dataLliurament: string;
      transportistaId: number;
      obsLliurament: string;
      linies: { producteId: number; unitatsDemanades: number; kgDemanats?: string }[];
    }>;

    const detalls: { camp: string; missatge: string }[] = [];
    if (!cos.origen || !['web', 'email', 'whatsapp', 'telefon'].includes(cos.origen)) {
      detalls.push({ camp: 'origen', missatge: 'ha de ser web, email, whatsapp o telefon' });
    }
    if (!cos.linies || cos.linies.length === 0) {
      detalls.push({ camp: 'linies', missatge: 'la comanda ha de tenir com a mínim una línia' });
    }
    if (detalls.length > 0) {
      return enviarValidacio(reply, 'Falten dades obligatòries', detalls);
    }

    let clientUuid: string | null = null;
    if (cos.clientId !== undefined) {
      clientUuid = await resolverClientUuid(pool, cos.clientId);
      if (clientUuid === null) {
        return enviarValidacio(reply, 'El client indicat no existeix', [
          { camp: 'clientId', missatge: 'no existeix' },
        ]);
      }
    }
    let transportistaUuid: string | null = null;
    if (cos.transportistaId !== undefined) {
      transportistaUuid = await resolverTransportistaUuid(pool, cos.transportistaId);
      if (transportistaUuid === null) {
        return enviarValidacio(reply, 'El transportista indicat no existeix', [
          { camp: 'transportistaId', missatge: 'no existeix' },
        ]);
      }
    }

    // Resolver y validar TODAS las líneas antes de escribir nada.
    const liniesResoltes: {
      producteUuid: string;
      unitats: number;
      preuUnitari: string;
      pesFitxaKg: string | null;
      pesCalculatKg: string;
      pesEditable: boolean;
    }[] = [];

    for (let i = 0; i < cos.linies!.length; i++) {
      const linia = cos.linies![i]!;
      const camp = `linies[${i}]`;

      if (!Number.isInteger(linia.unitatsDemanades) || linia.unitatsDemanades <= 0) {
        return enviarValidacio(reply, 'Les unitats demanades no poden ser zero', [
          { camp: `${camp}.unitatsDemanades`, missatge: 'ha de ser més gran que zero' },
        ]);
      }

      const producte = await pool.query<{
        id: string;
        pes_kg: string | null;
        preu_venda: string | null;
      }>('SELECT id, pes_kg, preu_venda FROM producte WHERE id_seq = $1', [linia.producteId]);
      if (!producte.rows[0]) {
        return enviarValidacio(reply, 'Un dels productes indicats no existeix', [
          { camp: `${camp}.producteId`, missatge: 'no existeix' },
        ]);
      }
      const { id: producteUuid, pes_kg: pesFitxaKg, preu_venda: preuVenda } = producte.rows[0];

      let pesCalculatKg: string;
      let pesEditable: boolean;
      if (pesFitxaKg !== null) {
        pesCalculatKg = (linia.unitatsDemanades * Number(pesFitxaKg)).toFixed(3);
        pesEditable = false;
      } else {
        const kgDemanats = linia.kgDemanats !== undefined ? Number(linia.kgDemanats) : NaN;
        if (!Number.isFinite(kgDemanats) || kgDemanats <= 0) {
          return enviarValidacio(reply, 'Els kg demanats no poden ser zero', [
            {
              camp: `${camp}.kgDemanats`,
              missatge: 'ha de ser més gran que zero (article a mida)',
            },
          ]);
        }
        pesCalculatKg = kgDemanats.toFixed(3);
        pesEditable = true;
      }

      liniesResoltes.push({
        producteUuid,
        unitats: linia.unitatsDemanades,
        preuUnitari: preuVenda ?? '0.00',
        pesFitxaKg,
        pesCalculatKg,
        pesEditable,
      });
    }

    const client = await pool.connect();
    let comandaUuid: string;
    try {
      await client.query('BEGIN');

      const totalEur = liniesResoltes
        .reduce((acc, l) => acc + l.unitats * Number(l.preuUnitari), 0)
        .toFixed(2);

      const comanda = await client.query<{ id: string }>(
        `INSERT INTO comanda (origen, estat, client_id, poblacio_desti, total, data_lliurament,
                               transportista_id, obs_lliurament)
         VALUES ($1, 'oberta', $2, NULL, $3, $4, $5, $6)
         RETURNING id`,
        [
          cos.origen,
          clientUuid,
          totalEur,
          cos.dataLliurament ?? null,
          transportistaUuid,
          cos.obsLliurament ?? null,
        ],
      );
      comandaUuid = comanda.rows[0]!.id;

      for (let i = 0; i < liniesResoltes.length; i++) {
        const l = liniesResoltes[i]!;
        await client.query(
          `INSERT INTO comanda_linia (comanda_id, ordinal, producte_id, unitats_demanades,
                                       preu_unitari, pes_fitxa_kg, pes_calculat_kg, pes_editable)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            comandaUuid,
            i,
            l.producteUuid,
            l.unitats,
            l.preuUnitari,
            l.pesFitxaKg,
            l.pesCalculatKg,
            l.pesEditable,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    reply.code(201);
    return carregarDetallPerUuid(comandaUuid);
  });

  fastify.patch('/comandes/:id', async (req, reply) => {
    const comandaUuid = await resolverComandaOResponder(reply, (req.params as { id: string }).id);
    if (comandaUuid === null) return;

    if (await estaCongelada(pool, comandaUuid)) {
      return enviarConflicte(reply, 'La comanda està congelada i ja no admet canvis');
    }

    const cos = req.body as Partial<{
      clientId: number | null;
      tarifaId: number | null;
      transportistaId: number | null;
      dataProduccio: string | null;
      dataExpedicio: string | null;
      dataLliurament: string | null;
      bultos: number | null;
      obsProduccio: string | null;
      obsLliurament: string | null;
      poblacioDesti: string | null;
    }>;

    let clientUuid: string | null | undefined;
    if (cos.clientId !== undefined) {
      clientUuid = cos.clientId === null ? null : await resolverClientUuid(pool, cos.clientId);
      if (cos.clientId !== null && clientUuid === null) {
        return enviarValidacio(reply, 'El client indicat no existeix', [
          { camp: 'clientId', missatge: 'no existeix' },
        ]);
      }
    }
    let tarifaUuid: string | null | undefined;
    if (cos.tarifaId !== undefined) {
      tarifaUuid = cos.tarifaId === null ? null : await resolverTarifaUuid(pool, cos.tarifaId);
      if (cos.tarifaId !== null && tarifaUuid === null) {
        return enviarValidacio(reply, 'La tarifa indicada no existeix', [
          { camp: 'tarifaId', missatge: 'no existeix' },
        ]);
      }
    }
    let transportistaUuid: string | null | undefined;
    if (cos.transportistaId !== undefined) {
      transportistaUuid =
        cos.transportistaId === null
          ? null
          : await resolverTransportistaUuid(pool, cos.transportistaId);
      if (cos.transportistaId !== null && transportistaUuid === null) {
        return enviarValidacio(reply, 'El transportista indicat no existeix', [
          { camp: 'transportistaId', missatge: 'no existeix' },
        ]);
      }
    }

    await pool.query(
      `UPDATE comanda SET
         client_id = CASE WHEN $2 THEN $3 ELSE client_id END,
         tarifa_id = CASE WHEN $4 THEN $5 ELSE tarifa_id END,
         transportista_id = CASE WHEN $6 THEN $7 ELSE transportista_id END,
         data_produccio = CASE WHEN $8 THEN $9 ELSE data_produccio END,
         data_expedicio = CASE WHEN $10 THEN $11 ELSE data_expedicio END,
         data_lliurament = CASE WHEN $12 THEN $13 ELSE data_lliurament END,
         bultos = CASE WHEN $14 THEN $15 ELSE bultos END,
         obs_produccio = CASE WHEN $16 THEN $17 ELSE obs_produccio END,
         obs_lliurament = CASE WHEN $18 THEN $19 ELSE obs_lliurament END,
         poblacio_desti = CASE WHEN $20 THEN $21 ELSE poblacio_desti END
       WHERE id = $1`,
      [
        comandaUuid,
        clientUuid !== undefined,
        clientUuid ?? null,
        tarifaUuid !== undefined,
        tarifaUuid ?? null,
        transportistaUuid !== undefined,
        transportistaUuid ?? null,
        cos.dataProduccio !== undefined,
        cos.dataProduccio ?? null,
        cos.dataExpedicio !== undefined,
        cos.dataExpedicio ?? null,
        cos.dataLliurament !== undefined,
        cos.dataLliurament ?? null,
        cos.bultos !== undefined,
        cos.bultos ?? null,
        cos.obsProduccio !== undefined,
        cos.obsProduccio ?? null,
        cos.obsLliurament !== undefined,
        cos.obsLliurament ?? null,
        cos.poblacioDesti !== undefined,
        cos.poblacioDesti ?? null,
      ],
    );

    return carregarDetallPerUuid(comandaUuid);
  });

  fastify.delete('/comandes/:comandaId/linies/:liniaId', async (req, reply) => {
    const params = req.params as { comandaId: string; liniaId: string };
    const comandaUuid = await resolverComandaOResponder(reply, params.comandaId);
    if (comandaUuid === null) return;

    if (await estaCongelada(pool, comandaUuid)) {
      return enviarConflicte(reply, 'La comanda està congelada i ja no admet canvis');
    }

    const liniaIdPublic = parsearIdPublic(params.liniaId);
    if (liniaIdPublic === null) return enviarNoTrobat(reply, 'Línia no trobada');

    const resultat = await pool.query(
      `UPDATE comanda_linia SET esborrat = true
       WHERE id_seq = $1 AND comanda_id = $2 RETURNING id`,
      [liniaIdPublic, comandaUuid],
    );
    if (resultat.rowCount === 0) return enviarNoTrobat(reply, 'Línia no trobada');

    reply.code(204);
  });
}
