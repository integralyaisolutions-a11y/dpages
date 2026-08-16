import type {
  FilaPanellEmpaquetatApi,
  FilaPanellObradorApi,
  FilaPanellOficinaApi,
} from '@dpages/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../../../db/pool.js';
import {
  construirPaginacio,
  enviarValidacio,
  formatearDataApi,
  parsearIdPublic,
  parsearPaginacio,
  resolverCategoriaUuid,
  resolverClientUuid,
  resolverTransportistaUuid,
} from './comu.js';

/** Nombre a mostrar cuando una línea SÍ está confirmada — ver misma nota en lliurament.ts sobre Firebase pendiente. */
const OPERARI_SENSE_AUTH_NOM = 'Desenvolupament (sense autenticació)';

async function resolverFiltreEntitat(
  reply: FastifyReply,
  valor: unknown,
  camp: string,
  resolver: (idSeq: number) => Promise<string | null>,
): Promise<string | undefined | null> {
  if (typeof valor !== 'string') return undefined;
  const idPublic = parsearIdPublic(valor);
  if (idPublic === null) {
    enviarValidacio(reply, `${camp} ha de ser un enter`);
    return null;
  }
  const uuid = await resolver(idPublic);
  return uuid ?? '00000000-0000-0000-0000-000000000000';
}

export function registrarRutesPanells(fastify: FastifyInstance): void {
  // ── 4.6 · Panell Oficina ─────────────────────────────────────────────
  fastify.get('/panells/oficina', async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    const condicions: string[] = [];
    const valors: unknown[] = [];

    if (typeof query.dataExpedicioDes === 'string' && query.dataExpedicioDes !== '') {
      condicions.push(`c.data_expedicio >= $${valors.length + 1}`);
      valors.push(query.dataExpedicioDes);
    }
    if (typeof query.dataExpedicioFins === 'string' && query.dataExpedicioFins !== '') {
      condicions.push(`c.data_expedicio <= $${valors.length + 1}`);
      valors.push(query.dataExpedicioFins);
    }
    if (typeof query.estat === 'string' && query.estat !== '') {
      condicions.push(`c.estat = $${valors.length + 1}`);
      valors.push(query.estat);
    }
    const transportistaUuid = await resolverFiltreEntitat(
      reply,
      query.transportistaId,
      'transportistaId',
      (id) => resolverTransportistaUuid(pool, id),
    );
    if (transportistaUuid === null) return;
    if (transportistaUuid !== undefined) {
      condicions.push(`c.transportista_id = $${valors.length + 1}`);
      valors.push(transportistaUuid);
    }
    const clientUuid = await resolverFiltreEntitat(reply, query.clientId, 'clientId', (id) =>
      resolverClientUuid(pool, id),
    );
    if (clientUuid === null) return;
    if (clientUuid !== undefined) {
      condicions.push(`c.client_id = $${valors.length + 1}`);
      valors.push(clientUuid);
    }
    const where = condicions.length > 0 ? `WHERE ${condicions.join(' AND ')}` : '';

    const base = `
      FROM comanda c
      LEFT JOIN client cl ON cl.id = c.client_id
      LEFT JOIN tarifa t ON t.id = c.tarifa_id
      LEFT JOIN transportista tr ON tr.id = c.transportista_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS linies, SUM(pes_calculat_kg) AS total_kg,
               SUM(unitats_demanades * preu_unitari) AS total_eur
        FROM comanda_linia WHERE comanda_id = c.id AND NOT esborrat
      ) agg ON true
      ${where}
    `;

    const totals = await pool.query<{
      comandes: string;
      linies: string;
      total_kg: string;
      total_eur: string;
    }>(
      `SELECT count(*) AS comandes, COALESCE(SUM(agg.linies), 0) AS linies,
              COALESCE(SUM(agg.total_kg), 0)::numeric(14,3) AS total_kg,
              COALESCE(SUM(agg.total_eur), 0)::numeric(14,2) AS total_eur
       ${base}`,
      valors,
    );

    const files = await pool.query<{
      id_seq: string;
      num: string;
      client_nom: string | null;
      poblacio_desti: string | null;
      tarifa_nom: string | null;
      transportista_nom: string | null;
      estat: string;
      data_comanda: Date;
      data_expedicio: Date | null;
      data_lliurament: Date | null;
      linies: string;
      total_kg: string;
      total_eur: string;
      obs_produccio: string | null;
      obs_lliurament: string | null;
    }>(
      `SELECT c.id_seq, c.num, cl.nom AS client_nom, c.poblacio_desti, t.nom AS tarifa_nom,
              tr.nom AS transportista_nom, c.estat, c.creat_en AS data_comanda, c.data_expedicio,
              c.data_lliurament, COALESCE(agg.linies, 0) AS linies,
              COALESCE(agg.total_kg, 0)::numeric(14,3) AS total_kg,
              COALESCE(agg.total_eur, 0)::numeric(14,2) AS total_eur,
              c.obs_produccio, c.obs_lliurament
       ${base}
       ORDER BY c.data_expedicio ASC NULLS LAST, c.creat_en ASC
       LIMIT $${valors.length + 1} OFFSET $${valors.length + 2}`,
      [...valors, mida, offset],
    );

    const dades: FilaPanellOficinaApi[] = files.rows.map((f) => ({
      comandaId: Number(f.id_seq),
      num: f.num,
      client: f.client_nom,
      poblacioDesti: f.poblacio_desti,
      tarifa: f.tarifa_nom,
      transportista: f.transportista_nom,
      estat: f.estat,
      dataComanda: formatearDataApi(f.data_comanda)!,
      dataExpedicio: formatearDataApi(f.data_expedicio),
      dataLliurament: formatearDataApi(f.data_lliurament),
      linies: Number(f.linies),
      totalKg: f.total_kg,
      totalEur: f.total_eur,
      obsProduccio: f.obs_produccio,
      obsLliurament: f.obs_lliurament,
    }));

    return {
      totals: {
        comandes: Number(totals.rows[0]?.comandes ?? 0),
        linies: Number(totals.rows[0]?.linies ?? 0),
        totalKg: totals.rows[0]?.total_kg ?? '0.000',
        totalEur: totals.rows[0]?.total_eur ?? '0.00',
      },
      dades,
      paginacio: construirPaginacio(pagina, mida, Number(totals.rows[0]?.comandes ?? 0)),
    };
  });

  // ── 4.7 · Panell Obrador (agrupado por artículo, no por pedido) ─────
  fastify.get('/panells/obrador', async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    const condicions: string[] = ['NOT cl.esborrat'];
    const valors: unknown[] = [];

    if (typeof query.dataProduccioDes === 'string' && query.dataProduccioDes !== '') {
      condicions.push(`c.data_produccio >= $${valors.length + 1}`);
      valors.push(query.dataProduccioDes);
    }
    if (typeof query.dataProduccioFins === 'string' && query.dataProduccioFins !== '') {
      condicions.push(`c.data_produccio <= $${valors.length + 1}`);
      valors.push(query.dataProduccioFins);
    }
    const categoriaUuid = await resolverFiltreEntitat(
      reply,
      query.categoriaId,
      'categoriaId',
      (id) => resolverCategoriaUuid(pool, id),
    );
    if (categoriaUuid === null) return;
    if (categoriaUuid !== undefined) {
      condicions.push(`p.categoria_id = $${valors.length + 1}`);
      valors.push(categoriaUuid);
    }
    if (query.tipus === 'simple' || query.tipus === 'variable') {
      condicions.push(`p.tipus = $${valors.length + 1}`);
      valors.push(query.tipus);
    }
    const where = `WHERE ${condicions.join(' AND ')}`;

    const base = `
      FROM comanda_linia cl
      JOIN comanda c ON c.id = cl.comanda_id
      JOIN producte p ON p.id = cl.producte_id
      LEFT JOIN categoria_producte cat ON cat.id = p.categoria_id
      ${where}
    `;

    const totals = await pool.query<{ linies: string; total_unitats: string; total_kg: string }>(
      `SELECT count(*) AS linies, COALESCE(SUM(cl.unitats_demanades), 0) AS total_unitats,
              COALESCE(SUM(cl.pes_calculat_kg), 0)::numeric(14,3) AS total_kg
       ${base}`,
      valors,
    );

    // Agrupado por artículo + fechas del lote (mismo producto puede tener
    // fechas distintas en pedidos distintos dentro del rango filtrado).
    const grupBy = `p.id_seq, p.codi, p.descripcio, p.tipus, cat.nom, c.data_produccio, c.data_expedicio, c.data_lliurament`;

    const totalGrups = await pool.query<{ count: string }>(
      `SELECT count(*) FROM (SELECT 1 ${base} GROUP BY ${grupBy}) sub`,
      valors,
    );

    const files = await pool.query<{
      id_seq: string;
      codi: string | null;
      descripcio: string;
      tipus: string;
      categoria_nom: string | null;
      data_produccio: Date | null;
      data_expedicio: Date | null;
      data_lliurament: Date | null;
      unitats: string;
      kg: string;
      obs_produccio: string | null;
      obs_lliurament: string | null;
    }>(
      `SELECT p.id_seq, p.codi, p.descripcio, p.tipus, cat.nom AS categoria_nom,
              c.data_produccio, c.data_expedicio, c.data_lliurament,
              SUM(cl.unitats_demanades) AS unitats,
              SUM(cl.pes_calculat_kg)::numeric(14,3) AS kg,
              string_agg(DISTINCT NULLIF(cl.obs_produccio, ''), ' · ') AS obs_produccio,
              string_agg(DISTINCT NULLIF(c.obs_lliurament, ''), ' · ') AS obs_lliurament
       ${base}
       GROUP BY ${grupBy}
       ORDER BY c.data_produccio ASC NULLS LAST, p.descripcio ASC
       LIMIT $${valors.length + 1} OFFSET $${valors.length + 2}`,
      [...valors, mida, offset],
    );

    const dades: FilaPanellObradorApi[] = files.rows.map((f) => ({
      producteId: Number(f.id_seq),
      codi: f.codi,
      producte: f.descripcio,
      tipus: f.tipus,
      categoria: f.categoria_nom,
      dataProduccio: formatearDataApi(f.data_produccio),
      dataExpedicio: formatearDataApi(f.data_expedicio),
      dataLliurament: formatearDataApi(f.data_lliurament),
      unitats: Number(f.unitats),
      kg: f.kg,
      obsProduccio: f.obs_produccio,
      obsLliurament: f.obs_lliurament,
    }));

    return {
      totals: {
        linies: Number(totals.rows[0]?.linies ?? 0),
        totalUnitats: Number(totals.rows[0]?.total_unitats ?? 0),
        totalKg: totals.rows[0]?.total_kg ?? '0.000',
      },
      dades,
      paginacio: construirPaginacio(pagina, mida, Number(totalGrups.rows[0]?.count ?? 0)),
    };
  });

  // ── 4.8 · Panell Empaquetat (único con edición — GET es sólo lectura, PATCH en lliurament.ts) ──
  fastify.get('/panells/empaquetat', async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    const condicions: string[] = ['NOT cl.esborrat'];
    const valors: unknown[] = [];

    if (typeof query.dataExpedicioDes === 'string' && query.dataExpedicioDes !== '') {
      condicions.push(`c.data_expedicio >= $${valors.length + 1}`);
      valors.push(query.dataExpedicioDes);
    }
    if (typeof query.dataExpedicioFins === 'string' && query.dataExpedicioFins !== '') {
      condicions.push(`c.data_expedicio <= $${valors.length + 1}`);
      valors.push(query.dataExpedicioFins);
    }
    const transportistaUuid = await resolverFiltreEntitat(
      reply,
      query.transportistaId,
      'transportistaId',
      (id) => resolverTransportistaUuid(pool, id),
    );
    if (transportistaUuid === null) return;
    if (transportistaUuid !== undefined) {
      condicions.push(`c.transportista_id = $${valors.length + 1}`);
      valors.push(transportistaUuid);
    }
    const clientUuid = await resolverFiltreEntitat(reply, query.clientId, 'clientId', (id) =>
      resolverClientUuid(pool, id),
    );
    if (clientUuid === null) return;
    if (clientUuid !== undefined) {
      condicions.push(`c.client_id = $${valors.length + 1}`);
      valors.push(clientUuid);
    }
    const where = `WHERE ${condicions.join(' AND ')}`;

    const base = `
      FROM comanda_linia cl
      JOIN comanda c ON c.id = cl.comanda_id
      LEFT JOIN client cli ON cli.id = c.client_id
      LEFT JOIN transportista tr ON tr.id = c.transportista_id
      LEFT JOIN producte p ON p.id = cl.producte_id
      ${where}
    `;

    const totals = await pool.query<{
      linies: string;
      unitats_demanades: string;
      unitats_lliurades: string;
      kg_demanats: string;
      kg_lliurats: string;
      linies_confirmades: string;
    }>(
      `SELECT count(*) AS linies,
              COALESCE(SUM(cl.unitats_demanades), 0) AS unitats_demanades,
              COALESCE(SUM(cl.unitats_lliurades), 0) AS unitats_lliurades,
              COALESCE(SUM(cl.pes_calculat_kg), 0)::numeric(14,3) AS kg_demanats,
              COALESCE(SUM(cl.kg_lliurats), 0)::numeric(14,3) AS kg_lliurats,
              count(*) FILTER (WHERE cl.confirmat_a IS NOT NULL) AS linies_confirmades
       ${base}`,
      valors,
    );

    const files = await pool.query<{
      id_seq: string;
      comanda_id_seq: string;
      num: string;
      data_expedicio: Date | null;
      data_lliurament: Date | null;
      transportista_nom: string | null;
      client_nom: string | null;
      codi: string | null;
      descripcio: string | null;
      unitats_demanades: number;
      kg_demanats: string;
      unitats_lliurades: number;
      kg_lliurats: string;
      confirmat_a: Date | null;
    }>(
      `SELECT cl.id_seq, c.id_seq AS comanda_id_seq, c.num, c.data_expedicio, c.data_lliurament,
              tr.nom AS transportista_nom, cli.nom AS client_nom, p.codi, p.descripcio,
              cl.unitats_demanades, cl.pes_calculat_kg AS kg_demanats, cl.unitats_lliurades,
              cl.kg_lliurats, cl.confirmat_a
       ${base}
       ORDER BY c.data_expedicio ASC NULLS LAST, c.num ASC, cl.ordinal ASC
       LIMIT $${valors.length + 1} OFFSET $${valors.length + 2}`,
      [...valors, mida, offset],
    );

    const totalLinies = Number(totals.rows[0]?.linies ?? 0);
    const liniesConfirmades = Number(totals.rows[0]?.linies_confirmades ?? 0);

    const dades: FilaPanellEmpaquetatApi[] = files.rows.map((f) => ({
      liniaId: Number(f.id_seq),
      comandaId: Number(f.comanda_id_seq),
      num: f.num,
      dataExpedicio: formatearDataApi(f.data_expedicio),
      dataLliurament: formatearDataApi(f.data_lliurament),
      transportista: f.transportista_nom,
      client: f.client_nom,
      codi: f.codi,
      producte: f.descripcio ?? '',
      unitatsDemanades: f.unitats_demanades,
      kgDemanats: f.kg_demanats,
      unitatsLliurades: f.unitats_lliurades,
      kgLliurats: f.kg_lliurats,
      confirmatA: formatearDataApi(f.confirmat_a),
      confirmatPer: f.confirmat_a !== null ? OPERARI_SENSE_AUTH_NOM : null,
    }));

    return {
      totals: {
        linies: totalLinies,
        unitatsDemanades: Number(totals.rows[0]?.unitats_demanades ?? 0),
        unitatsLliurades: Number(totals.rows[0]?.unitats_lliurades ?? 0),
        kgDemanats: totals.rows[0]?.kg_demanats ?? '0.000',
        kgLliurats: totals.rows[0]?.kg_lliurats ?? '0.000',
        liniesConfirmades,
        liniesPendents: totalLinies - liniesConfirmades,
      },
      dades,
      paginacio: construirPaginacio(pagina, mida, totalLinies),
    };
  });
}
