import type {
  ComandaDetallApi,
  ComandaLiniaApi,
  ComandaResumApi,
  IncidenciaComandaApi,
} from '@dpages/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../../db/pool.js';
import {
  condicioDataFinsInclusiva,
  construirPaginacio,
  enviarConflicte,
  enviarNoTrobat,
  enviarValidacio,
  esUnitatsValides,
  formatearDataApi,
  parsearIdPublic,
  parsearPaginacio,
  resolverClientUuid,
  resolverComandaUuid,
  resolverTarifaUuid,
  resolverTransportistaUuid,
} from './comu.js';

// Capa 31 — únicos 4 valors admesos per comanda.estat (mateixa llista que el
// CHECK constraint de la taula, migració 0003). No hi havia cap constant
// reutilitzable per a això abans d'aquesta capa.
const ESTATS_COMANDA_VALIDS = ['oberta', 'en_proces', 'tancada', 'amb_incidencia'] as const;

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
  adreca_lliurament: string | null;
  data_comanda: Date;
  data_produccio: Date | null;
  dates_produccio_linies: Date[];
  data_expedicio: Date | null;
  data_lliurament: Date | null;
  bultos: number | null;
  congelat_a: Date | null;
  obs_produccio: string | null;
  obs_lliurament: string | null;
  total_linies: string;
  total_kg: string;
  total_eur: string;
  total_incidencies: string;
  tipus_incidencia: string | null;
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
    adrecaLliurament: fila.adreca_lliurament,
    dataComanda: formatearDataApi(fila.data_comanda)!,
    dataProduccio: formatearDataApi(fila.data_produccio),
    datesProduccioLinies: fila.dates_produccio_linies.map((d) => formatearDataApi(d)!),
    dataExpedicio: formatearDataApi(fila.data_expedicio),
    dataLliurament: formatearDataApi(fila.data_lliurament),
    bultos: fila.bultos,
    totalLinies: Number(fila.total_linies),
    totalKg: fila.total_kg,
    totalEur: fila.total_eur,
    congelada: fila.congelat_a !== null,
    totalIncidencies: Number(fila.total_incidencies),
    tipusIncidencia: fila.tipus_incidencia,
  };
}

// data_comanda = comanda.creat_en (cuándo entró al sistema): para pedidos web es
// prácticamente el momento real del pedido (sync casi en tiempo real); para los
// capturados a mano (email/WhatsApp/teléfono) es exactamente ese momento. No hay
// ninguna otra columna que represente mejor "cuándo se hizo el pedido".
// tipus_incidencia: sólo se completa cuando TODAS las incidencias de la
// comanda comparten el mismo tipus (min() de un conjunto de un solo valor
// distinto); si hay más de un tipo mezclado, queda null — "resumen liviano",
// el detalle completo por tipo está en GET /comandes/:id (incidencies[]).
const SELECT_COMANDA_RESUM = `
  SELECT c.id_seq, c.num, oc.codi AS origen, c.estat,
         cl.id_seq AS client_id_seq, cl.nom AS client_nom, cl.poblacio AS client_poblacio,
         t.id_seq AS tarifa_id_seq, t.nom AS tarifa_nom,
         tr.id_seq AS transportista_id_seq, tr.nom AS transportista_nom,
         c.poblacio_desti, c.adreca_lliurament, c.creat_en AS data_comanda, c.data_produccio,
         COALESCE(dp.dates, '{}') AS dates_produccio_linies, c.data_expedicio,
         c.data_lliurament, c.bultos, c.congelat_a, c.obs_produccio, c.obs_lliurament,
         COALESCE(agg.total_linies, 0) AS total_linies,
         COALESCE(agg.total_kg, 0)::numeric(14,3) AS total_kg,
         COALESCE(agg.total_eur, 0)::numeric(14,2) AS total_eur,
         COALESCE(inc.total_incidencies, 0) AS total_incidencies,
         inc.tipus_incidencia
  FROM comanda c
  JOIN origen_comanda oc ON oc.id = c.origen_id
  LEFT JOIN client cl ON cl.id = c.client_id
  LEFT JOIN tarifa t ON t.id = c.tarifa_id
  LEFT JOIN transportista tr ON tr.id = c.transportista_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS total_linies, SUM(pes_calculat_kg) AS total_kg,
           SUM(unitats_demanades * preu_unitari) AS total_eur
    FROM comanda_linia WHERE comanda_id = c.id AND NOT esborrat
  ) agg ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS total_incidencies,
           CASE WHEN count(DISTINCT tipus) = 1 THEN min(tipus) END AS tipus_incidencia
    FROM incidencia_comanda WHERE comanda_id = c.id
  ) inc ON true
  -- Capa 21: fechas de producción DISTINTAS entre las líneas del pedido,
  -- ordenadas — ver ComandaResumApi.datesProduccioLinies.
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT data_produccio ORDER BY data_produccio) AS dates
    FROM comanda_linia
    WHERE comanda_id = c.id AND NOT esborrat AND data_produccio IS NOT NULL
  ) dp ON true
`;

interface FilaComandaLinia {
  id_seq: string;
  ordinal: number;
  producte_id_seq: string | null;
  producte_codi: string | null;
  producte_descripcio: string | null;
  categoria_nom: string | null;
  format: string | null;
  envasat: string | null;
  // Capa 38 — NUMERIC(10,2) desde la migración 0016 (antes INTEGER): `pg`
  // siempre devuelve columnas NUMERIC como string, nunca number.
  unitats_demanades: string;
  kg_demanats: string;
  pes_editable: boolean;
  unitats_lliurades: string;
  kg_lliurats: string;
  confirmat_a: Date | null;
  preu_unitari: string;
  total_linia: string;
  data_produccio: Date | null;
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
    categoria: fila.categoria_nom,
    format: fila.format,
    envasat: fila.envasat,
    unitatsDemanades: fila.unitats_demanades,
    kgDemanats: fila.kg_demanats,
    kgEditable: fila.pes_editable,
    unitatsLliurades: fila.unitats_lliurades,
    kgLliurats: fila.kg_lliurats,
    confirmatA: formatearDataApi(fila.confirmat_a),
    preuUnitari: fila.preu_unitari,
    totalLinia: fila.total_linia,
    dataProduccio: formatearDataApi(fila.data_produccio),
    obsProduccio: fila.obs_produccio,
    esborrat: fila.esborrat,
  };
}

const SELECT_COMANDA_LINIA = `
  SELECT cl.id_seq, cl.ordinal, p.id_seq AS producte_id_seq, p.codi AS producte_codi,
         p.descripcio AS producte_descripcio, cat.nom AS categoria_nom, p.format, p.envasat,
         cl.unitats_demanades, cl.pes_calculat_kg AS kg_demanats,
         cl.pes_editable, cl.unitats_lliurades, cl.kg_lliurats, cl.confirmat_a, cl.preu_unitari,
         (cl.unitats_demanades * cl.preu_unitari)::numeric(14,2) AS total_linia,
         cl.data_produccio, cl.obs_produccio, cl.esborrat
  FROM comanda_linia cl
  LEFT JOIN producte p ON p.id = cl.producte_id
  LEFT JOIN categoria_producte cat ON cat.id = p.categoria_id
  WHERE cl.comanda_id = $1 AND NOT cl.esborrat
  ORDER BY cl.ordinal ASC
`;

interface FilaIncidenciaComanda {
  tipus: string;
  detall: string;
  creat_en: Date;
}

function aApiIncidencia(fila: FilaIncidenciaComanda): IncidenciaComandaApi {
  return { tipus: fila.tipus, detall: fila.detall, creatA: formatearDataApi(fila.creat_en)! };
}

const SELECT_COMANDA_INCIDENCIES = `
  SELECT tipus, detall, creat_en FROM incidencia_comanda
  WHERE comanda_id = $1
  ORDER BY creat_en ASC
`;

/** Detalle completo (cabecera + líneas + incidencias) por UUID interno — usado por GET/POST/PATCH para no repetir la misma consulta tres veces. */
async function carregarDetallPerUuid(comandaUuid: string): Promise<ComandaDetallApi> {
  const cap = await pool.query<FilaComandaResum>(`${SELECT_COMANDA_RESUM} WHERE c.id = $1`, [
    comandaUuid,
  ]);
  const linies = await pool.query<FilaComandaLinia>(SELECT_COMANDA_LINIA, [comandaUuid]);
  const incidencies = await pool.query<FilaIncidenciaComanda>(SELECT_COMANDA_INCIDENCIES, [
    comandaUuid,
  ]);
  const fila = cap.rows[0]!;
  const {
    totalLinies: _totalLinies,
    totalIncidencies: _totalInc,
    tipusIncidencia: _tipusInc,
    ...resum
  } = aApiResum(fila);
  return {
    ...resum,
    obsProduccio: fila.obs_produccio,
    obsLliurament: fila.obs_lliurament,
    congelatA: formatearDataApi(fila.congelat_a),
    linies: linies.rows.map(aApiLinia),
    incidencies: incidencies.rows.map(aApiIncidencia),
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

/**
 * Cascada de resolución de precio de línia (contrato,
 * `ComandaLiniaApi.preuUnitari`): 1) la tarifa indicada, si tiene precio
 * para este producto; 2) si no, el precio base del producto; 3) si tampoco
 * hay ninguno de los dos, "0.00" — `sensePreu` le indica al llamador que hay
 * que registrar una incidencia, nunca queda una línea con precio
 * silenciosamente en cero.
 *
 * La "tarifa indicada" (`tarifaId`) depende de quién llama, esta función no
 * decide eso:
 * - `POST /comandes` (capa 32): el `tarifaId` explícito del body si vino,
 *   si no la del cliente (`client.tarifa_id`).
 * - `POST /comandes/:comandaId/linies` (capa 30): SIEMPRE la del cliente,
 *   resuelta fresca — no cambia con esta capa.
 * - `comanda.tarifa_id` editado después vía `PATCH /comandes/:id` NO pasa
 *   nunca por acá — esa edición no recalcula líneas existentes, a propósito
 *   (fuera de alcance de la capa 32, ver docs/contrato-api.md).
 */
async function resolverPreuLinia(
  dbPool: Pool,
  tarifaId: string | null,
  producteUuid: string,
  preuVenda: string | null,
): Promise<{ preuUnitari: string; sensePreu: boolean }> {
  if (tarifaId !== null) {
    const tarifa = await dbPool.query<{ preu: string }>(
      'SELECT preu FROM tarifa_preu WHERE tarifa_id = $1 AND producte_id = $2',
      [tarifaId, producteUuid],
    );
    if (tarifa.rows[0]) return { preuUnitari: tarifa.rows[0].preu, sensePreu: false };
  }
  if (preuVenda !== null) return { preuUnitari: preuVenda, sensePreu: false };
  return { preuUnitari: '0.00', sensePreu: true };
}

/**
 * Capa 30 — recalcula `comanda.total` a partir de las líneas activas, con
 * la MISMA fórmula que ya usa `SELECT_COMANDA_RESUM.agg.total_eur`
 * (`SUM(unitats_demanades * preu_unitari) WHERE NOT esborrat`).
 *
 * IMPORTANTE, para quien lea esto después: ningún `GET` lee esta columna.
 * `ComandaResumApi.totalEur`/`ComandaDetallApi.totalEur` SIEMPRE se
 * calculan en vivo desde `comanda_linia` (ver `agg` en
 * `SELECT_COMANDA_RESUM`) — `comanda.total` es un campo espejo que sólo
 * escriben `POST /comandes` (al crear) y el sync de WooCommerce
 * (`transform/comandes.ts`), nunca se vuelve a leer por la API. Se
 * mantiene igual aquí por higiene de datos (que la columna no quede
 * desactualizada), no porque afecte ninguna respuesta visible. Ni
 * `DELETE /comandes/:comandaId/linies/:liniaId` (capa anterior) recalcula
 * esta columna — gap preexistente, no lo toco acá.
 */
async function recalcularTotalComanda(client: PoolClient, comandaUuid: string): Promise<void> {
  await client.query(
    `UPDATE comanda SET total = (
       SELECT COALESCE(SUM(unitats_demanades * preu_unitari), 0)::numeric(14,2)
       FROM comanda_linia WHERE comanda_id = $1 AND NOT esborrat
     )
     WHERE id = $1`,
    [comandaUuid],
  );
}

interface CapcaleraDatesComanda {
  dataProduccio: string | Date | null;
  dataExpedicio: string | Date | null;
  dataLliurament: string | Date | null;
}

interface LiniaPerValidarDates {
  /** Identifica la línia dins del `missatge` d'error — un índex del body en alta ("línia 2") o el número públic d'una línia ja existent ("línia núm. 981"). */
  etiqueta: string;
  dataProduccio: string | Date | null | undefined;
}

/**
 * Capa 34 — les 6 regles de coherència temporal entre les dates de
 * capçalera d'un pedido i les dates de producció de les seves línies
 * (documentades a `docs/contrato-api.md`, secció 4.5). Punt únic de
 * veritat: NO duplicar aquesta comparació als 4 llocs que la criden
 * (`POST /comandes`, `POST .../linies`, `PATCH .../linies/:liniaId`,
 * `PATCH /comandes/:id`).
 *
 * Cada regla només aplica si AMBDUES dates comparades tenen valor — si en
 * falta una, aquesta regla en concret no bloqueja res. "anterior"/
 * "posterior" és ESTRICTE: dates iguals estan permeses (no hi havia una
 * resolució explícita del client sobre aquest cas límit; es documenta a
 * `docs/contrato-api.md` perquè quedi com a criteri explícit, no un
 * misteri).
 *
 * Retorna la PRIMERA violació trobada, o `null` si tot és coherent — no
 * cal acumular-les totes, amb la primera ja n'hi ha prou per al 400.
 */
function validarCoherenciaDatesComanda(
  capcalera: CapcaleraDatesComanda,
  linies: LiniaPerValidarDates[],
): { camp: string; missatge: string } | null {
  const dp = capcalera.dataProduccio !== null ? new Date(capcalera.dataProduccio).getTime() : null;
  const de = capcalera.dataExpedicio !== null ? new Date(capcalera.dataExpedicio).getTime() : null;
  const dl =
    capcalera.dataLliurament !== null ? new Date(capcalera.dataLliurament).getTime() : null;

  // Regla 1: dataLliurament no anterior a dataProduccio (capçalera).
  if (dp !== null && dl !== null && dl < dp) {
    return { camp: 'dataLliurament', missatge: 'no pot ser anterior a dataProduccio' };
  }
  // Regla 2: dataExpedicio no anterior a dataProduccio (capçalera).
  if (dp !== null && de !== null && de < dp) {
    return { camp: 'dataExpedicio', missatge: 'no pot ser anterior a dataProduccio' };
  }
  // Regla 3: dataExpedicio no posterior a dataLliurament.
  if (de !== null && dl !== null && de > dl) {
    return { camp: 'dataExpedicio', missatge: 'no pot ser posterior a dataLliurament' };
  }

  for (const linia of linies) {
    if (linia.dataProduccio === null || linia.dataProduccio === undefined) continue;
    const dLinia = new Date(linia.dataProduccio).getTime();
    // Regla 4: dataProduccio de línia no anterior a dataProduccio de capçalera.
    if (dp !== null && dLinia < dp) {
      return {
        camp: 'linies[].dataProduccio',
        missatge: `${linia.etiqueta}: dataProduccio no pot ser anterior a la dataProduccio de la comanda`,
      };
    }
    // Regla 5: dataProduccio de línia no posterior a dataLliurament.
    if (dl !== null && dLinia > dl) {
      return {
        camp: 'linies[].dataProduccio',
        missatge: `${linia.etiqueta}: dataProduccio no pot ser posterior a dataLliurament`,
      };
    }
    // Regla 6: dataProduccio de línia no posterior a dataExpedicio.
    if (de !== null && dLinia > de) {
      return {
        camp: 'linies[].dataProduccio',
        missatge: `${linia.etiqueta}: dataProduccio no pot ser posterior a dataExpedicio`,
      };
    }
  }

  return null;
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
      condicions.push(`oc.codi = $${valors.length + 1}`);
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
      condicions.push(condicioDataFinsInclusiva('c.creat_en', valors.length + 1));
      valors.push(query.dataFins);
    }
    // Capa 21 — filtra "el pedido tiene AL MENOS UNA línea cuya
    // dataProduccio cae en el rango" (caso de uso: planificación de
    // obrador). Las dos condiciones van en el MISMO EXISTS para que sea
    // una sola línea la que cumpla ambos extremos a la vez — dos EXISTS
    // separados matchearían igual si una línea cumple sólo "des" y otra
    // distinta cumple sólo "fins", sin que ninguna caiga realmente en el
    // rango pedido.
    const condicionsLiniaProduccio: string[] = [];
    if (typeof query.dataProduccioDes === 'string' && query.dataProduccioDes !== '') {
      condicionsLiniaProduccio.push(`cl2.data_produccio >= $${valors.length + 1}`);
      valors.push(query.dataProduccioDes);
    }
    if (typeof query.dataProduccioFins === 'string' && query.dataProduccioFins !== '') {
      condicionsLiniaProduccio.push(
        condicioDataFinsInclusiva('cl2.data_produccio', valors.length + 1),
      );
      valors.push(query.dataProduccioFins);
    }
    if (condicionsLiniaProduccio.length > 0) {
      condicions.push(
        `EXISTS (SELECT 1 FROM comanda_linia cl2 WHERE cl2.comanda_id = c.id ` +
          `AND NOT cl2.esborrat AND ${condicionsLiniaProduccio.join(' AND ')})`,
      );
    }
    if (typeof query.dataLliuramentDes === 'string' && query.dataLliuramentDes !== '') {
      condicions.push(`c.data_lliurament >= $${valors.length + 1}`);
      valors.push(query.dataLliuramentDes);
    }
    if (typeof query.dataLliuramentFins === 'string' && query.dataLliuramentFins !== '') {
      condicions.push(condicioDataFinsInclusiva('c.data_lliurament', valors.length + 1));
      valors.push(query.dataLliuramentFins);
    }
    if (typeof query.cerca === 'string' && query.cerca.trim() !== '') {
      condicions.push(`c.num ILIKE $${valors.length + 1}`);
      valors.push(`%${query.cerca.trim()}%`);
    }
    const where = condicions.length > 0 ? `WHERE ${condicions.join(' AND ')}` : '';

    const total = await pool.query<{ count: string }>(
      `SELECT count(*) FROM comanda c JOIN origen_comanda oc ON oc.id = c.origen_id ${where}`,
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
      tarifaId: number;
      dataLliurament: string;
      transportistaId: number;
      obsLliurament: string;
      linies: {
        producteId: number;
        unitatsDemanades: number;
        kgDemanats?: string;
        dataProduccio?: string | null;
      }[];
    }>;

    const detalls: { camp: string; missatge: string }[] = [];
    if (!cos.origen || cos.origen.trim() === '') {
      detalls.push({ camp: 'origen', missatge: 'és obligatori' });
    }
    if (!cos.linies || cos.linies.length === 0) {
      detalls.push({ camp: 'linies', missatge: 'la comanda ha de tenir com a mínim una línia' });
    }
    if (detalls.length > 0) {
      return enviarValidacio(reply, 'Falten dades obligatòries', detalls);
    }

    // Capa 34 — al crear, la comanda encara no té dataProduccio/dataExpedicio
    // de capçalera (no són camps d'aquest body, només dataLliurament), així
    // que de les 6 regles, aquí només poden arribar a disparar-se les que
    // depenen de dataLliurament (regla 5 per a cada línia).
    const violacioCreacio = validarCoherenciaDatesComanda(
      { dataProduccio: null, dataExpedicio: null, dataLliurament: cos.dataLliurament ?? null },
      cos.linies!.map((l, i) => ({ etiqueta: `línia ${i + 1}`, dataProduccio: l.dataProduccio })),
    );
    if (violacioCreacio) {
      return enviarValidacio(reply, 'Les dates no són coherents', [violacioCreacio]);
    }

    // origen ja no és un enum fix (capa 13/14, migració 0013): és el codi
    // d'una fila d'origen_comanda — es resol igual que clientId/
    // transportistaId més avall.
    const origen = await pool.query<{ id: string }>(
      'SELECT id FROM origen_comanda WHERE codi = $1',
      [cos.origen],
    );
    if (!origen.rows[0]) {
      return enviarValidacio(reply, "L'origen indicat no existeix", [
        { camp: 'origen', missatge: 'no existeix' },
      ]);
    }
    const origenUuid = origen.rows[0].id;

    let clientUuid: string | null = null;
    let clientTarifaId: string | null = null;
    if (cos.clientId !== undefined) {
      clientUuid = await resolverClientUuid(pool, cos.clientId);
      if (clientUuid === null) {
        return enviarValidacio(reply, 'El client indicat no existeix', [
          { camp: 'clientId', missatge: 'no existeix' },
        ]);
      }
      const clientFila = await pool.query<{ tarifa_id: string | null }>(
        'SELECT tarifa_id FROM client WHERE id = $1',
        [clientUuid],
      );
      clientTarifaId = clientFila.rows[0]?.tarifa_id ?? null;
    }
    // Capa 32 — tarifaId explícito en el body de creación anula la del
    // cliente SÓLO para resolver el precio de estas líneas, y se guarda en
    // comanda.tarifa_id (columna ya existente, hasta ahora sólo editable
    // vía PATCH y sin efecto real en el precio — ver nota en
    // resolverPreuLinia). Si no viene, comportamiento idéntico al de
    // siempre: se usa clientTarifaId y comanda.tarifa_id queda NULL.
    let tarifaUuid: string | null = null;
    if (cos.tarifaId !== undefined) {
      tarifaUuid = await resolverTarifaUuid(pool, cos.tarifaId);
      if (tarifaUuid === null) {
        return enviarValidacio(reply, 'La tarifa indicada no existeix', [
          { camp: 'tarifaId', missatge: 'no existeix' },
        ]);
      }
    }
    const tarifaEfectivaId = tarifaUuid ?? clientTarifaId;
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
      producteIdPublic: number;
      unitats: number;
      preuUnitari: string;
      sensePreu: boolean;
      pesFitxaKg: string | null;
      pesCalculatKg: string;
      pesEditable: boolean;
      dataProduccio: string | null;
    }[] = [];

    for (let i = 0; i < cos.linies!.length; i++) {
      const linia = cos.linies![i]!;
      const camp = `linies[${i}]`;

      // Capa 38 — unitats_demanades pasó de INTEGER a NUMERIC(10,2): admite
      // decimales (entregas/pedidos parciales de pieza), hasta 2 decimales.
      if (!esUnitatsValides(linia.unitatsDemanades)) {
        return enviarValidacio(reply, 'Les unitats demanades no poden ser zero', [
          {
            camp: `${camp}.unitatsDemanades`,
            missatge: 'ha de ser més gran que zero, com a màxim 2 decimals',
          },
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

      const { preuUnitari, sensePreu } = await resolverPreuLinia(
        pool,
        tarifaEfectivaId,
        producteUuid,
        preuVenda,
      );

      liniesResoltes.push({
        producteUuid,
        producteIdPublic: linia.producteId,
        unitats: linia.unitatsDemanades,
        preuUnitari,
        sensePreu,
        pesFitxaKg,
        pesCalculatKg,
        pesEditable,
        dataProduccio: linia.dataProduccio ?? null,
      });
    }

    const client = await pool.connect();
    let comandaUuid: string;
    try {
      await client.query('BEGIN');

      const totalEur = liniesResoltes
        .reduce((acc, l) => acc + l.unitats * Number(l.preuUnitari), 0)
        .toFixed(2);
      // Si alguna línea no pudo resolver precio (ni tarifa ni preu_venda),
      // el pedido nace directamente amb_incidencia — mismo criterio que el
      // resto del sistema (nunca "oberta" con un problema silencioso).
      const teLiniaSensePreu = liniesResoltes.some((l) => l.sensePreu);

      const comanda = await client.query<{ id: string }>(
        `INSERT INTO comanda (origen_id, estat, client_id, tarifa_id, poblacio_desti, total,
                               data_lliurament, transportista_id, obs_lliurament)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8)
         RETURNING id`,
        [
          origenUuid,
          teLiniaSensePreu ? 'amb_incidencia' : 'oberta',
          clientUuid,
          tarifaUuid,
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
                                       preu_unitari, pes_fitxa_kg, pes_calculat_kg, pes_editable,
                                       data_produccio)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            comandaUuid,
            i,
            l.producteUuid,
            l.unitats,
            l.preuUnitari,
            l.pesFitxaKg,
            l.pesCalculatKg,
            l.pesEditable,
            l.dataProduccio,
          ],
        );
        if (l.sensePreu) {
          await client.query(
            `INSERT INTO incidencia_comanda (comanda_id, tipus, detall) VALUES ($1, 'sense_preu', $2)`,
            [
              comandaUuid,
              `Línia ${i + 1}: el producte ${l.producteIdPublic} no té preu resolt (sense tarifa amb preu ni preu base) — preuUnitari es va deixar en 0.00.`,
            ],
          );
        }
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
      adrecaLliurament: string | null;
      estat: string;
      detall: string;
    }>;

    if (cos.estat !== undefined) {
      if (!ESTATS_COMANDA_VALIDS.includes(cos.estat as (typeof ESTATS_COMANDA_VALIDS)[number])) {
        return enviarValidacio(reply, 'El estat indicat no és vàlid', [
          { camp: 'estat', missatge: `ha de ser un de: ${ESTATS_COMANDA_VALIDS.join(', ')}` },
        ]);
      }
      // Capa 31 — decisión de negocio: transiciones libres entre los 4
      // estados, sin máquina de estados. Única excepción: pasar a
      // amb_incidencia manualmente exige un motivo (detall), porque a
      // diferencia de las incidencias automáticas (sense_preu, etc.) acá no
      // hay ningún dato del sistema del que derivarlo.
      if (cos.estat === 'amb_incidencia' && (!cos.detall || cos.detall.trim() === '')) {
        return enviarValidacio(reply, 'El detall és obligatori per marcar amb_incidencia', [
          { camp: 'detall', missatge: 'és obligatori quan estat és amb_incidencia' },
        ]);
      }
    }

    // Capa 34 — el cas delicat: si aquest PATCH canvia alguna de les 3 dates
    // de capçalera, cal calcular l'estat RESULTANT (valor nou si ha vingut,
    // si no el que ja hi havia guardat) i validar-lo no només contra les
    // altres dates de capçalera (regles 1/2/3), sinó també contra TOTES les
    // línies actives del pedido (regles 4/5/6) — encara que cap d'elles
    // s'estigui tocant en aquest request. Un canvi de data de capçalera pot
    // invalidar una línia de la qual ningú s'està ocupant ara mateix.
    if (
      cos.dataProduccio !== undefined ||
      cos.dataExpedicio !== undefined ||
      cos.dataLliurament !== undefined
    ) {
      const actual = await pool.query<{
        data_produccio: Date | null;
        data_expedicio: Date | null;
        data_lliurament: Date | null;
      }>('SELECT data_produccio, data_expedicio, data_lliurament FROM comanda WHERE id = $1', [
        comandaUuid,
      ]);
      const filaActual = actual.rows[0]!;
      const dataProduccioResultant =
        cos.dataProduccio !== undefined ? cos.dataProduccio : filaActual.data_produccio;
      const dataExpedicioResultant =
        cos.dataExpedicio !== undefined ? cos.dataExpedicio : filaActual.data_expedicio;
      const dataLliuramentResultant =
        cos.dataLliurament !== undefined ? cos.dataLliurament : filaActual.data_lliurament;

      const liniesExistents = await pool.query<{ id_seq: string; data_produccio: Date | null }>(
        `SELECT id_seq, data_produccio FROM comanda_linia WHERE comanda_id = $1 AND NOT esborrat`,
        [comandaUuid],
      );

      const violacio = validarCoherenciaDatesComanda(
        {
          dataProduccio: dataProduccioResultant,
          dataExpedicio: dataExpedicioResultant,
          dataLliurament: dataLliuramentResultant,
        },
        liniesExistents.rows.map((l) => ({
          etiqueta: `línia núm. ${l.id_seq}`,
          dataProduccio: l.data_produccio,
        })),
      );
      if (violacio) {
        return enviarValidacio(reply, 'Les dates no són coherents', [violacio]);
      }
    }

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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
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
           poblacio_desti = CASE WHEN $20 THEN $21 ELSE poblacio_desti END,
           adreca_lliurament = CASE WHEN $22 THEN $23 ELSE adreca_lliurament END,
           estat = CASE WHEN $24 THEN $25 ELSE estat END
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
          cos.adrecaLliurament !== undefined,
          cos.adrecaLliurament ?? null,
          cos.estat !== undefined,
          cos.estat ?? null,
        ],
      );

      // Capa 31 — a diferencia de las incidencias automáticas (sense_preu,
      // article_no_resolt, etc.), ésta la dispara un usuario de oficina a
      // mano, sin que el sistema haya detectado nada por sí solo. Mismo
      // array/tabla (incidencia_comanda), tipus distinto para diferenciarla.
      if (cos.estat === 'amb_incidencia') {
        await client.query(
          `INSERT INTO incidencia_comanda (comanda_id, tipus, detall) VALUES ($1, 'manual', $2)`,
          [comandaUuid, cos.detall],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return carregarDetallPerUuid(comandaUuid);
  });

  /**
   * Capa 30 — agregar una línea a un pedido YA creado. Hasta ahora sólo se
   * podían cargar líneas embebidas en `POST /comandes` (alta completa) —
   * la única forma de corregir un pedido existente era borrarlo entero y
   * recargarlo de cero, perdiendo el número de pedido original.
   *
   * Precio: MISMA cascada que `POST /comandes` (`resolverPreuLinia`), sin
   * duplicar la lógica. La tarifa que se usa es la del CLIENTE asignado a
   * la comanda (resuelta fresca acá) — OJO, esto sigue así después de la
   * capa 32: `comanda.tarifa_id` puede tener un valor real (fijado al crear
   * el pedido, o editado después vía `PATCH /comandes/:id`), pero esta ruta
   * NUNCA lo consulta, siempre usa `client.tarifa_id`. No es un descuido:
   * la capa 32 sólo tocó el momento de creación, a propósito.
   *
   * Capa 34 — el body ahora acepta `dataProduccio` opcional para la línea
   * nueva (antes no existía este campo acá, sólo se podía fijar después vía
   * `PATCH .../linies/:liniaId` — lo agregué porque si no, la validación de
   * coherencia de fechas pedida para este endpoint no tenía nada real que
   * validar). Si viene, se valida contra las fechas de cabecera YA
   * GUARDADAS del pedido (reglas 4/5/6 de `validarCoherenciaDatesComanda`).
   */
  fastify.post('/comandes/:comandaId/linies', async (req, reply) => {
    const comandaUuid = await resolverComandaOResponder(
      reply,
      (req.params as { comandaId: string }).comandaId,
    );
    if (comandaUuid === null) return;

    if (await estaCongelada(pool, comandaUuid)) {
      return enviarConflicte(reply, 'La comanda està congelada i ja no admet canvis');
    }

    const cos = req.body as Partial<{
      producteId: number;
      unitatsDemanades: number;
      kgDemanats: string;
      dataProduccio: string | null;
    }>;

    if (cos.producteId === undefined) {
      return enviarValidacio(reply, 'producteId és obligatori', [
        { camp: 'producteId', missatge: 'és obligatori' },
      ]);
    }
    // Capa 38 — ver nota equivalente en POST /comandes.
    if (!esUnitatsValides(cos.unitatsDemanades)) {
      return enviarValidacio(reply, 'Les unitats demanades no poden ser zero', [
        {
          camp: 'unitatsDemanades',
          missatge: 'ha de ser més gran que zero, com a màxim 2 decimals',
        },
      ]);
    }

    const producte = await pool.query<{
      id: string;
      pes_kg: string | null;
      preu_venda: string | null;
    }>('SELECT id, pes_kg, preu_venda FROM producte WHERE id_seq = $1', [cos.producteId]);
    if (!producte.rows[0]) {
      return enviarValidacio(reply, 'El producte indicat no existeix', [
        { camp: 'producteId', missatge: 'no existeix' },
      ]);
    }
    const { id: producteUuid, pes_kg: pesFitxaKg, preu_venda: preuVenda } = producte.rows[0];

    let pesCalculatKg: string;
    let pesEditable: boolean;
    if (pesFitxaKg !== null) {
      pesCalculatKg = (cos.unitatsDemanades * Number(pesFitxaKg)).toFixed(3);
      pesEditable = false;
    } else {
      const kgDemanats = cos.kgDemanats !== undefined ? Number(cos.kgDemanats) : NaN;
      if (!Number.isFinite(kgDemanats) || kgDemanats <= 0) {
        return enviarValidacio(reply, 'Els kg demanats no poden ser zero', [
          { camp: 'kgDemanats', missatge: 'ha de ser més gran que zero (article a mida)' },
        ]);
      }
      pesCalculatKg = kgDemanats.toFixed(3);
      pesEditable = true;
    }

    // Capa 34 — si la línia nova porta dataProduccio, validar-la contra les
    // dates de capçalera JA GUARDADES d'aquest pedido, abans d'inserir res.
    if (cos.dataProduccio !== undefined) {
      const capcalera = await pool.query<{
        data_produccio: Date | null;
        data_expedicio: Date | null;
        data_lliurament: Date | null;
      }>('SELECT data_produccio, data_expedicio, data_lliurament FROM comanda WHERE id = $1', [
        comandaUuid,
      ]);
      const fila = capcalera.rows[0]!;
      const violacio = validarCoherenciaDatesComanda(
        {
          dataProduccio: fila.data_produccio,
          dataExpedicio: fila.data_expedicio,
          dataLliurament: fila.data_lliurament,
        },
        [{ etiqueta: 'línia nova', dataProduccio: cos.dataProduccio }],
      );
      if (violacio) {
        return enviarValidacio(reply, 'Les dates no són coherents', [violacio]);
      }
    }

    const clientTarifaFila = await pool.query<{ tarifa_id: string | null }>(
      `SELECT cl.tarifa_id FROM comanda c LEFT JOIN client cl ON cl.id = c.client_id WHERE c.id = $1`,
      [comandaUuid],
    );
    const clientTarifaId = clientTarifaFila.rows[0]?.tarifa_id ?? null;

    const { preuUnitari, sensePreu } = await resolverPreuLinia(
      pool,
      clientTarifaId,
      producteUuid,
      preuVenda,
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ordinalFila = await client.query<{ seguent: number }>(
        `SELECT COALESCE(max(ordinal), -1) + 1 AS seguent FROM comanda_linia WHERE comanda_id = $1`,
        [comandaUuid],
      );
      const ordinal = ordinalFila.rows[0]!.seguent;

      await client.query(
        `INSERT INTO comanda_linia (comanda_id, ordinal, producte_id, unitats_demanades,
                                     preu_unitari, pes_fitxa_kg, pes_calculat_kg, pes_editable,
                                     data_produccio)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          comandaUuid,
          ordinal,
          producteUuid,
          cos.unitatsDemanades,
          preuUnitari,
          pesFitxaKg,
          pesCalculatKg,
          pesEditable,
          cos.dataProduccio ?? null,
        ],
      );

      // Mismo criterio que POST /comandes: una línea sin precio resuelto
      // nunca queda silenciosa — se registra la incidencia, y la comanda
      // pasa a amb_incidencia si todavía no lo estaba (mismo motivo por el
      // que un pedido nace amb_incidencia si nace con una línea así).
      if (sensePreu) {
        await client.query(
          `INSERT INTO incidencia_comanda (comanda_id, tipus, detall) VALUES ($1, 'sense_preu', $2)`,
          [
            comandaUuid,
            `Línia afegida (producte ${cos.producteId}): no té preu resolt (sense tarifa amb preu ni preu base) — preuUnitari es va deixar en 0.00.`,
          ],
        );
        await client.query(
          `UPDATE comanda SET estat = 'amb_incidencia' WHERE id = $1 AND estat != 'amb_incidencia'`,
          [comandaUuid],
        );
      }

      await recalcularTotalComanda(client, comandaUuid);

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

  /**
   * Capa 30 — editar una línea existente (unitats/kg/dataProduccio/
   * obsProduccio). NUNCA re-resuelve `preuUnitari` — sólo recalcula
   * `totalLinia`, y eso ya es automático: `SELECT_COMANDA_LINIA` calcula
   * `totalLinia` en vivo (`unitats_demanades * preu_unitari`), no es una
   * columna guardada. Mientras esta ruta no toque `preu_unitari` (nunca lo
   * hace), cualquier lectura posterior ya sale bien sola.
   *
   * Capa 34 — si `dataProduccio` viene en el body, se valida contra las
   * fechas de cabecera YA GUARDADAS del pedido (reglas 4/5/6 de
   * `validarCoherenciaDatesComanda`) antes de escribir nada.
   */
  fastify.patch('/comandes/:comandaId/linies/:liniaId', async (req, reply) => {
    const params = req.params as { comandaId: string; liniaId: string };
    const comandaUuid = await resolverComandaOResponder(reply, params.comandaId);
    if (comandaUuid === null) return;

    if (await estaCongelada(pool, comandaUuid)) {
      return enviarConflicte(reply, 'La comanda està congelada i ja no admet canvis');
    }

    const liniaIdPublic = parsearIdPublic(params.liniaId);
    if (liniaIdPublic === null) return enviarNoTrobat(reply, 'Línia no trobada');

    const cos = req.body as Partial<{
      unitatsDemanades: number;
      kgDemanats: string;
      dataProduccio: string | null;
      obsProduccio: string | null;
    }>;

    // Capa 38 — ver nota equivalente en POST /comandes.
    if (cos.unitatsDemanades !== undefined && !esUnitatsValides(cos.unitatsDemanades)) {
      return enviarValidacio(reply, 'Les unitats demanades no poden ser zero', [
        {
          camp: 'unitatsDemanades',
          missatge: 'ha de ser més gran que zero, com a màxim 2 decimals',
        },
      ]);
    }
    if (cos.kgDemanats !== undefined) {
      const kgNum = Number(cos.kgDemanats);
      if (!Number.isFinite(kgNum) || kgNum <= 0) {
        return enviarValidacio(reply, 'Els kg demanats no poden ser zero', [
          { camp: 'kgDemanats', missatge: 'ha de ser més gran que zero' },
        ]);
      }
    }

    const liniaActual = await pool.query<{
      pes_editable: boolean;
      pes_fitxa_kg: string | null;
    }>(
      `SELECT pes_editable, pes_fitxa_kg FROM comanda_linia WHERE id_seq = $1 AND comanda_id = $2`,
      [liniaIdPublic, comandaUuid],
    );
    if (!liniaActual.rows[0]) return enviarNoTrobat(reply, 'Línia no trobada');
    const { pes_editable: pesEditable, pes_fitxa_kg: pesFitxaKg } = liniaActual.rows[0];

    if (cos.kgDemanats !== undefined && !pesEditable) {
      return enviarValidacio(reply, "El pes d'aquest article no és editable (té fitxa)", [
        { camp: 'kgDemanats', missatge: 'no editable — es calcula des de unitatsDemanades' },
      ]);
    }

    // Si cambian las unidades de un artículo CON fitxa, el peso se
    // recalcula solo (mismo criterio que POST /comandes) — kgDemanats no
    // se acepta en ese caso (ya rechazado arriba). Para un artículo "a
    // medida", el peso es lo que venga en kgDemanats, sin relación con
    // unitatsDemanades.
    let pesCalculatKgNou: string | undefined;
    if (cos.unitatsDemanades !== undefined && pesFitxaKg !== null) {
      pesCalculatKgNou = (cos.unitatsDemanades * Number(pesFitxaKg)).toFixed(3);
    } else if (cos.kgDemanats !== undefined) {
      pesCalculatKgNou = Number(cos.kgDemanats).toFixed(3);
    }

    // Capa 34 — si aquest PATCH canvia dataProduccio de la línia, validar-la
    // contra les dates de capçalera JA GUARDADES d'aquest pedido, abans
    // d'escriure res. Si dataProduccio NO ve al body, no hi ha res nou a
    // validar (ni la línia ni la capçalera van a canviar de valor per això).
    if (cos.dataProduccio !== undefined) {
      const capcalera = await pool.query<{
        data_produccio: Date | null;
        data_expedicio: Date | null;
        data_lliurament: Date | null;
      }>('SELECT data_produccio, data_expedicio, data_lliurament FROM comanda WHERE id = $1', [
        comandaUuid,
      ]);
      const fila = capcalera.rows[0]!;
      const violacio = validarCoherenciaDatesComanda(
        {
          dataProduccio: fila.data_produccio,
          dataExpedicio: fila.data_expedicio,
          dataLliurament: fila.data_lliurament,
        },
        [{ etiqueta: `línia ${liniaIdPublic}`, dataProduccio: cos.dataProduccio }],
      );
      if (violacio) {
        return enviarValidacio(reply, 'Les dates no són coherents', [violacio]);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const resultat = await client.query<{ id: string }>(
        `UPDATE comanda_linia SET
           unitats_demanades = CASE WHEN $3 THEN $4 ELSE unitats_demanades END,
           pes_calculat_kg = CASE WHEN $5 THEN $6 ELSE pes_calculat_kg END,
           data_produccio = CASE WHEN $7 THEN $8 ELSE data_produccio END,
           obs_produccio = CASE WHEN $9 THEN $10 ELSE obs_produccio END
         WHERE id_seq = $1 AND comanda_id = $2
         RETURNING id`,
        [
          liniaIdPublic,
          comandaUuid,
          cos.unitatsDemanades !== undefined,
          cos.unitatsDemanades ?? null,
          pesCalculatKgNou !== undefined,
          pesCalculatKgNou ?? null,
          cos.dataProduccio !== undefined,
          cos.dataProduccio ?? null,
          cos.obsProduccio !== undefined,
          cos.obsProduccio ?? null,
        ],
      );
      if (!resultat.rows[0]) {
        await client.query('ROLLBACK');
        return enviarNoTrobat(reply, 'Línia no trobada');
      }

      await recalcularTotalComanda(client, comandaUuid);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

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
