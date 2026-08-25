import type {
  FilaPanellEmpaquetatApi,
  FilaPanellObradorApi,
  FilaPanellOficinaApi,
  PanellProduccioFilaApi,
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

type AgrupacioRendiment = 'KG' | 'MAGRE' | 'PAQ';
const AGRUPACIONS_RENDIMENT: readonly AgrupacioRendiment[] = ['KG', 'MAGRE', 'PAQ'];

function esAgrupacioRendimentValida(valor: unknown): valor is AgrupacioRendiment {
  return typeof valor === 'string' && AGRUPACIONS_RENDIMENT.includes(valor as AgrupacioRendiment);
}

/** `YYYY-MM-DD`, día actual del servidor + offset — para los defaults de dataDes/dataFins. */
function dataIsoAmbOffset(diesOffset: number): string {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + diesOffset);
  return data.toISOString().slice(0, 10);
}

/**
 * Rendimiento fijo por cerdo — Francesc, WhatsApp 25/08/2026: "De media, de
 * 1 cerdo salen 12Kg de jamón, 6Kg de recortes, y 7Kg de paletillas."
 * Valores fijos confirmados por el cliente, NO calculados desde
 * `rendiments_porcs` (no hay artículos de catálogo individuales para
 * "jamón"/"recortes"/"paletillas" con esos rendimientos cargados) —
 * pendiente de exponer como configuración si cambian en el futuro.
 */
const KG_JAMON_PER_CERDO = 12;
const KG_RECORTES_PER_CERDO = 6;
const KG_PALETILLAS_PER_CERDO = 7;

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
      LEFT JOIN LATERAL (
        SELECT count(*) AS total_incidencies,
               CASE WHEN count(DISTINCT tipus) = 1 THEN min(tipus) END AS tipus_incidencia
        FROM incidencia_comanda WHERE comanda_id = c.id
      ) inc ON true
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
      total_incidencies: string;
      tipus_incidencia: string | null;
    }>(
      `SELECT c.id_seq, c.num, cl.nom AS client_nom, c.poblacio_desti, t.nom AS tarifa_nom,
              tr.nom AS transportista_nom, c.estat, c.creat_en AS data_comanda, c.data_expedicio,
              c.data_lliurament, COALESCE(agg.linies, 0) AS linies,
              COALESCE(agg.total_kg, 0)::numeric(14,3) AS total_kg,
              COALESCE(agg.total_eur, 0)::numeric(14,2) AS total_eur,
              c.obs_produccio, c.obs_lliurament,
              COALESCE(inc.total_incidencies, 0) AS total_incidencies, inc.tipus_incidencia
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
      totalIncidencies: Number(f.total_incidencies),
      tipusIncidencia: f.tipus_incidencia,
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

  // ── 4.7 · Panell Obrador (líneas de pedido individuales, no agregado) ──
  fastify.get('/panells/obrador', async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    const condicions: string[] = ['NOT cl.esborrat'];
    const valors: unknown[] = [];

    // dataProduccio filtra por la fecha de la LÍNEA (cl.data_produccio), no
    // la de la cabecera del pedido — desde que Obrador dejó de ser agregado
    // por producto (contrato, sección 4.7), es la línea la que tiene fecha
    // de producción propia; la de comanda es otro campo (sección 4.5).
    if (typeof query.dataProduccioDes === 'string' && query.dataProduccioDes !== '') {
      condicions.push(`cl.data_produccio >= $${valors.length + 1}`);
      valors.push(query.dataProduccioDes);
    }
    if (typeof query.dataProduccioFins === 'string' && query.dataProduccioFins !== '') {
      condicions.push(`cl.data_produccio <= $${valors.length + 1}`);
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
    if (typeof query.producte === 'string' && query.producte.trim() !== '') {
      // Coincidencia EXACTA por descripción, case-insensitive — mismo
      // criterio que /panells/produccio y /rendiments-porcs (regla 3.1
      // transversal), no substring.
      condicions.push(`LOWER(p.descripcio) = LOWER($${valors.length + 1})`);
      valors.push(query.producte.trim());
    }
    if (typeof query.format === 'string' && query.format.trim() !== '') {
      condicions.push(`p.format = $${valors.length + 1}`);
      valors.push(query.format.trim());
    }
    if (typeof query.envasat === 'string' && query.envasat.trim() !== '') {
      condicions.push(`p.envasat = $${valors.length + 1}`);
      valors.push(query.envasat.trim());
    }
    const where = `WHERE ${condicions.join(' AND ')}`;

    // INNER JOIN a producte: igual que antes de esta reescritura, una línia
    // sin artículo resuelto (producte_id nulo — ver migración 0005) no tiene
    // nada que mostrar acá y queda fuera.
    const base = `
      FROM comanda_linia cl
      JOIN comanda c ON c.id = cl.comanda_id
      JOIN producte p ON p.id = cl.producte_id
      LEFT JOIN categoria_producte cat ON cat.id = p.categoria_id
      LEFT JOIN client cli ON cli.id = c.client_id
      ${where}
    `;

    const totals = await pool.query<{ linies: string; total_unitats: string; total_kg: string }>(
      `SELECT count(*) AS linies, COALESCE(SUM(cl.unitats_demanades), 0) AS total_unitats,
              COALESCE(SUM(cl.pes_calculat_kg), 0)::numeric(14,3) AS total_kg
       ${base}`,
      valors,
    );

    const files = await pool.query<{
      linia_id_seq: string;
      comanda_id_seq: string;
      producte_id_seq: string;
      producte_codi: string | null;
      producte_descripcio: string;
      categoria_nom: string | null;
      format: string | null;
      envasat: string | null;
      client_nom: string | null;
      data_produccio: Date | null;
      unitats: number;
      kg: string;
      obs_produccio: string | null;
    }>(
      `SELECT cl.id_seq AS linia_id_seq, c.id_seq AS comanda_id_seq,
              p.id_seq AS producte_id_seq, p.codi AS producte_codi, p.descripcio AS producte_descripcio,
              cat.nom AS categoria_nom, p.format, p.envasat, cli.nom AS client_nom,
              cl.data_produccio, cl.unitats_demanades AS unitats, cl.pes_calculat_kg AS kg,
              cl.obs_produccio
       ${base}
       ORDER BY cl.data_produccio ASC NULLS LAST, c.num ASC, cl.ordinal ASC
       LIMIT $${valors.length + 1} OFFSET $${valors.length + 2}`,
      [...valors, mida, offset],
    );

    const dades: FilaPanellObradorApi[] = files.rows.map((f) => ({
      liniaId: Number(f.linia_id_seq),
      comandaId: Number(f.comanda_id_seq),
      producte: {
        id: Number(f.producte_id_seq),
        codi: f.producte_codi,
        descripcio: f.producte_descripcio,
      },
      categoria: f.categoria_nom,
      format: f.format,
      envasat: f.envasat,
      client: f.client_nom,
      dataProduccio: formatearDataApi(f.data_produccio),
      unitats: f.unitats,
      kg: f.kg,
      obsProduccio: f.obs_produccio,
    }));

    return {
      totals: {
        linies: Number(totals.rows[0]?.linies ?? 0),
        totalUnitats: Number(totals.rows[0]?.total_unitats ?? 0),
        totalKg: totals.rows[0]?.total_kg ?? '0.000',
      },
      dades,
      paginacio: construirPaginacio(pagina, mida, Number(totals.rows[0]?.linies ?? 0)),
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
      confirmat_per: string | null;
    }>(
      `SELECT cl.id_seq, c.id_seq AS comanda_id_seq, c.num, c.data_expedicio, c.data_lliurament,
              tr.nom AS transportista_nom, cli.nom AS client_nom, p.codi, p.descripcio,
              cl.unitats_demanades, cl.pes_calculat_kg AS kg_demanats, cl.unitats_lliurades,
              cl.kg_lliurats, cl.confirmat_a, cl.confirmat_per
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
      // Sin tabla de usuarios todavía (capa posterior): se muestra el uid
      // real de Firebase (o el marcador de desarrollo con AUTH_DISABLED),
      // no un nombre — no hay ningún directorio del que sacarlo.
      confirmatPer: f.confirmat_per,
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

  // ── 4.10 · Panell Producció ──────────────────────────────────────────
  fastify.get('/panells/produccio', async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { pagina, mida, offset } = parsearPaginacio(query);

    // Calculadora interactiva: sin nombrePorcs no hay nada que calcular —
    // un default silencioso podría hacer pensar al usuario que un número
    // inventado es el resultado real. Se exige explícito, siempre.
    const nombrePorcs = typeof query.nombrePorcs === 'string' ? Number(query.nombrePorcs) : NaN;
    if (!Number.isFinite(nombrePorcs) || nombrePorcs <= 0) {
      return enviarValidacio(reply, 'nombrePorcs és obligatori i ha de ser més gran que zero', [
        { camp: 'nombrePorcs', missatge: 'és obligatori i ha de ser més gran que zero' },
      ]);
    }

    if (
      query.agrupacioRendiment !== undefined &&
      query.agrupacioRendiment !== '' &&
      !esAgrupacioRendimentValida(query.agrupacioRendiment)
    ) {
      return enviarValidacio(
        reply,
        `agrupacioRendiment ha de ser ${AGRUPACIONS_RENDIMENT.join(', ')}`,
      );
    }

    const dataDes =
      typeof query.dataDes === 'string' && query.dataDes !== ''
        ? query.dataDes
        : dataIsoAmbOffset(1);
    const dataFins =
      typeof query.dataFins === 'string' && query.dataFins !== ''
        ? query.dataFins
        : dataIsoAmbOffset(7);

    const condicions: string[] = [
      `c.estat = 'oberta'`,
      'cat.elaborat_porc = true',
      'NOT cl.esborrat',
      // ::date descarta la hora — dataDes/dataFins son fechas, no instantes,
      // y así funciona sin importar si vienen como "YYYY-MM-DD" o un
      // timestamp completo.
      `cl.data_produccio::date BETWEEN $${1}::date AND $${2}::date`,
      // agrupacioProduccio/agrupacioRendiment son NO nulables en
      // PanellProduccioFilaApi (contrato) — una línia cuyo producte no
      // tiene agrupació de producció, o cuya categoria no tiene agrupació
      // de rendiment, no tiene con qué rellenar esos campos. Mismo
      // criterio que rendiments-porcs.ts (capa 14): queda fuera en vez de
      // romper el contrato con un null donde no lo admite.
      'p.agrupacio_produccio IS NOT NULL',
      'cat.agrupacio_rendiment IS NOT NULL',
    ];
    const valors: unknown[] = [dataDes, dataFins];

    if (query.agrupacioRendiment !== undefined && query.agrupacioRendiment !== '') {
      condicions.push(`cat.agrupacio_rendiment = $${valors.length + 1}`);
      valors.push(query.agrupacioRendiment);
    }
    if (typeof query.producte === 'string' && query.producte.trim() !== '') {
      // Coincidencia EXACTA por descripción, no substring — mismo criterio
      // corregido en rendiments-porcs.ts (capa 14).
      condicions.push(`LOWER(p.descripcio) = LOWER($${valors.length + 1})`);
      valors.push(query.producte.trim());
    }
    const where = `WHERE ${condicions.join(' AND ')}`;

    // Agrupado por agrupacio_produccio + agrupacio_rendiment (no por
    // producte_id): varios artículos pueden compartir una misma agrupación
    // de producción — por eso, capa 22, `producte` YA NO viaja en la
    // respuesta (ver PanellProduccioFilaApi, BREAKING). `ORDER BY p.id_seq`
    // dentro de los array_agg se mantiene igual: sigue haciendo falta un
    // criterio determinístico para elegir categoria_nom/unitats_per_porc/
    // kg_per_unitat cuando varios productos de la agrupación traen valores
    // distintos — ya no es "cuál producte mostrar", es "qué fila de
    // rendiments_porcs usar para el cálculo".
    const filas = await pool.query<{
      agrupacio_produccio: string;
      agrupacio_rendiment: AgrupacioRendiment;
      categoria_nom: string;
      unitats_per_porc: string | null;
      kg_per_unitat: string | null;
      kg_a_elaborar: string;
      paq_pedido: string;
    }>(
      `SELECT p.agrupacio_produccio, cat.agrupacio_rendiment,
              (array_agg(cat.nom ORDER BY p.id_seq))[1] AS categoria_nom,
              (array_agg(rp.unitats_per_porc ORDER BY p.id_seq))[1] AS unitats_per_porc,
              (array_agg(rp.kg_per_unitat ORDER BY p.id_seq))[1] AS kg_per_unitat,
              SUM(cl.pes_calculat_kg)::numeric(14,3) AS kg_a_elaborar,
              SUM(cl.unitats_demanades) AS paq_pedido
       FROM comanda_linia cl
       JOIN comanda c ON c.id = cl.comanda_id
       JOIN producte p ON p.id = cl.producte_id
       JOIN categoria_producte cat ON cat.id = p.categoria_id
       LEFT JOIN rendiments_porcs rp ON rp.producte_id = p.id
       ${where}
       GROUP BY p.agrupacio_produccio, cat.agrupacio_rendiment
       ORDER BY p.agrupacio_produccio ASC`,
      valors,
    );

    let totalKgAElaborarNum = 0;
    let totalKgMagroNum = 0;
    const dadesCompletes: PanellProduccioFilaApi[] = filas.rows.map((f) => {
      const unitatsPerPorc = f.unitats_per_porc !== null ? Number(f.unitats_per_porc) : null;
      const kgPerUnitat = f.kg_per_unitat !== null ? Number(f.kg_per_unitat) : null;

      if (f.agrupacio_rendiment === 'PAQ') {
        let rendiment: string | null = null;
        let diferencia: string | null = null;
        if (unitatsPerPorc !== null) {
          const rendimentNum = unitatsPerPorc * nombrePorcs;
          rendiment = rendimentNum.toFixed(2);
          diferencia = (rendimentNum - Number(f.paq_pedido)).toFixed(2);
        }
        return {
          agrupacioRendiment: f.agrupacio_rendiment,
          categoria: f.categoria_nom,
          agrupacioProduccio: f.agrupacio_produccio,
          paqPedido: Number(f.paq_pedido).toFixed(2),
          kgAElaborar: null,
          rendiment,
          diferencia,
        };
      }

      // KG o MAGRE: kgAElaborar cuenta para el total de cabecera siempre
      // (nunca para PAQ, ver totals.totalKgAElaborar más abajo).
      totalKgAElaborarNum += Number(f.kg_a_elaborar);

      let rendiment: string | null = null;
      let diferencia: string | null = null;
      if (f.agrupacio_rendiment === 'KG') {
        if (unitatsPerPorc !== null && kgPerUnitat !== null) {
          const rendimentNum = unitatsPerPorc * kgPerUnitat * nombrePorcs;
          rendiment = rendimentNum.toFixed(3);
          diferencia = (rendimentNum - Number(f.kg_a_elaborar)).toFixed(3);
        }
      } else if (kgPerUnitat !== null) {
        // MAGRE: no hay cálculo por fila — el rendimiento potencial de
        // esta agrupación va al total global (totals.totalKgMagro), una
        // sola vez por agrupación, no por línia individual.
        totalKgMagroNum += kgPerUnitat * nombrePorcs;
      }

      return {
        agrupacioRendiment: f.agrupacio_rendiment,
        categoria: f.categoria_nom,
        agrupacioProduccio: f.agrupacio_produccio,
        paqPedido: null,
        kgAElaborar: f.kg_a_elaborar,
        rendiment,
        diferencia,
      };
    });

    const dades = dadesCompletes.slice(offset, offset + mida);

    return {
      totals: {
        totalKgAElaborar: totalKgAElaborarNum.toFixed(3),
        totalKgMagro: totalKgMagroNum.toFixed(3),
        diferencia: (totalKgMagroNum - totalKgAElaborarNum).toFixed(3),
        // Capa 24 — rendimiento fijo por cerdo (ver constantes arriba).
        // nombrePorcs ya está validado como obligatorio y > 0 más arriba
        // en el handler, así que estos tres campos siempre traen un valor.
        kgJamon: (KG_JAMON_PER_CERDO * nombrePorcs).toFixed(3),
        kgRecortes: (KG_RECORTES_PER_CERDO * nombrePorcs).toFixed(3),
        kgPaletillas: (KG_PALETILLAS_PER_CERDO * nombrePorcs).toFixed(3),
      },
      dades,
      paginacio: construirPaginacio(pagina, mida, dadesCompletes.length),
    };
  });
}
