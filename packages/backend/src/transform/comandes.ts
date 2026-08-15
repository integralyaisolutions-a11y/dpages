import type { Pool, PoolClient } from 'pg';
import type { WooOrder } from '@dpages/shared';
import { pool as poolPerDefecte } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { parsearFechaGmt } from '../sync/fechas.js';
import { calcularPesLinia } from './pes.js';
import { resolverArticle } from './resolucio-article.js';

export interface ResultatComanda {
  comandaId: string;
  /** true = había congelat_a; no se tocó ni cabecera ni líneas, se registró incidencia. */
  congelada: boolean;
  /** false = se descartó por guardián de versión (no es un error, es lo esperado con entregas fuera de orden). */
  actualitzada: boolean;
  liniesNoResoltes: number;
}

export interface ResultatTransformacioComandes {
  comandesProcessades: number;
  comandesActualitzades: number;
  comandesCongelades: number;
  comandesDescartadesPerVersio: number;
  liniesNoResoltes: number;
  errors: number;
}

interface FilaComandaExistent {
  id: string;
  congelat_a: Date | null;
}

async function obtenirComandaExistent(
  client: PoolClient,
  wooOrderId: number,
): Promise<FilaComandaExistent | null> {
  const res = await client.query<FilaComandaExistent>(
    'SELECT id, congelat_a FROM comanda WHERE woo_order_id = $1',
    [wooOrderId],
  );
  return res.rows[0] ?? null;
}

/**
 * "Se registra como incidencia" (ADR-007 y resolución de artículo): queda
 * un registro consultable, no sólo la marca en `estat`. `estat` se pisa a
 * 'amb_incidencia' aunque la comanda ya estuviera en otro estado — es la
 * señal para oficina de que hay algo que mirar.
 */
async function registrarIncidencia(
  client: PoolClient,
  comandaId: string,
  tipus: string,
  detall: string,
): Promise<void> {
  await client.query(
    `INSERT INTO incidencia_comanda (comanda_id, tipus, detall) VALUES ($1, $2, $3)`,
    [comandaId, tipus, detall],
  );
  await client.query(`UPDATE comanda SET estat = 'amb_incidencia' WHERE id = $1`, [comandaId]);
}

async function crearComanda(client: PoolClient, wooOrder: WooOrder): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO comanda (woo_order_id, origen, estat, estat_web, poblacio_desti, total, data_modificacio_woo)
     VALUES ($1, 'web', 'oberta', $2, $3, $4, $5)
     RETURNING id`,
    [
      wooOrder.id,
      wooOrder.status,
      wooOrder.shipping.city,
      wooOrder.total,
      parsearFechaGmt(wooOrder.date_modified_gmt),
    ],
  );
  return res.rows[0]!.id;
}

/**
 * Guardián de versión (ADR-004) + propiedad de columnas (ADR-005) en una
 * sola sentencia atómica: el UPDATE sólo toca columnas que el sync tiene
 * permitido tocar (estado web, población destino, total — "unidades
 * pedidas" y "precio unitario" son de línea, ver processarLinies), y sólo
 * aplica si la comanda no está congelada y la versión entrante es más
 * nueva que la almacenada. Nunca se lee primero y se decide después: la
 * condición va en el propio WHERE para que sea atómica.
 */
async function actualitzarCapcaleraSiCorrespon(
  client: PoolClient,
  comandaId: string,
  wooOrder: WooOrder,
): Promise<boolean> {
  const dataModificacio = parsearFechaGmt(wooOrder.date_modified_gmt);
  const res = await client.query(
    `UPDATE comanda SET
       estat_web = $2,
       poblacio_desti = $3,
       total = $4,
       data_modificacio_woo = $5
     WHERE id = $1
       AND congelat_a IS NULL
       AND (data_modificacio_woo IS NULL OR data_modificacio_woo < $5)`,
    [comandaId, wooOrder.status, wooOrder.shipping.city, wooOrder.total, dataModificacio],
  );
  return (res.rowCount ?? 0) > 0;
}

interface FilaLiniaExistentCruda {
  id: string;
  /** pg devuelve BIGINT como string (no cabe siempre en un number de JS de forma segura) — se normaliza al leer. */
  woo_line_item_id: string | null;
  producte_id: string | null;
  ordinal: number;
}

interface FilaLiniaExistent {
  id: string;
  wooLineItemId: number | null;
  producteId: string | null;
  ordinal: number;
}

/**
 * Líneas: nunca DELETE+INSERT (ADR-006). Emparejamiento por
 * woo_line_item_id primero (pero esos ids no son estables cuando se edita
 * el pedido desde el admin de WooCommerce); si no coincide, por
 * (producte_id, ordinal). Las que no vienen más se marcan esborrat, nunca
 * se eliminan físicamente — borraría los kilos/unidades que empaquetado ya
 * haya registrado.
 */
async function processarLinies(
  client: PoolClient,
  comandaId: string,
  wooOrder: WooOrder,
): Promise<{ liniesNoResoltes: number }> {
  const crudas = await client.query<FilaLiniaExistentCruda>(
    `SELECT id, woo_line_item_id, producte_id, ordinal FROM comanda_linia WHERE comanda_id = $1 AND NOT esborrat`,
    [comandaId],
  );
  const existents: FilaLiniaExistent[] = crudas.rows.map((e) => ({
    id: e.id,
    wooLineItemId: e.woo_line_item_id === null ? null : Number(e.woo_line_item_id),
    producteId: e.producte_id,
    ordinal: e.ordinal,
  }));

  const usades = new Set<string>();
  let noResoltes = 0;

  for (let ordinal = 0; ordinal < wooOrder.line_items.length; ordinal++) {
    const item = wooOrder.line_items[ordinal]!;
    const sku = item.sku && item.sku.trim() !== '' ? item.sku.trim() : null;
    const resolucio = await resolverArticle(client, item.product_id, item.variation_id, sku);
    if (!resolucio) noResoltes++;

    let pesFitxaKg: string | null = null;
    if (resolucio) {
      const producte = await client.query<{ pes_kg: string | null }>(
        'SELECT pes_kg FROM producte WHERE id = $1',
        [resolucio.producteId],
      );
      pesFitxaKg = producte.rows[0]?.pes_kg ?? null;
    }
    const pes = calcularPesLinia(item.quantity, pesFitxaKg);
    const preuUnitari = item.price.toFixed(2);

    let existent = existents.find((e) => !usades.has(e.id) && e.wooLineItemId === item.id);
    if (!existent && resolucio) {
      existent = existents.find(
        (e) => !usades.has(e.id) && e.producteId === resolucio.producteId && e.ordinal === ordinal,
      );
    }

    const valores = [
      ordinal,
      item.id,
      resolucio?.producteId ?? null,
      resolucio?.aliasProducteId ?? null,
      item.product_id,
      item.variation_id,
      sku,
      item.quantity,
      preuUnitari,
      pes.pesFitxaKg,
      pes.pesCalculatKg,
      pes.pesEditable,
    ];

    if (existent) {
      usades.add(existent.id);
      await client.query(
        `UPDATE comanda_linia SET
           ordinal = $2, woo_line_item_id = $3, producte_id = $4, alias_producte_id = $5,
           woo_product_id = $6, woo_variation_id = $7, woo_sku = $8,
           unitats_demanades = $9, preu_unitari = $10,
           pes_fitxa_kg = $11, pes_calculat_kg = $12, pes_editable = $13
         WHERE id = $1`,
        [existent.id, ...valores],
      );
    } else {
      await client.query(
        `INSERT INTO comanda_linia (
           comanda_id, ordinal, woo_line_item_id, producte_id, alias_producte_id,
           woo_product_id, woo_variation_id, woo_sku,
           unitats_demanades, preu_unitari, pes_fitxa_kg, pes_calculat_kg, pes_editable
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [comandaId, ...valores],
      );
    }
  }

  const noUsades = existents.filter((e) => !usades.has(e.id)).map((e) => e.id);
  if (noUsades.length > 0) {
    await client.query(`UPDATE comanda_linia SET esborrat = true WHERE id = ANY($1)`, [noUsades]);
  }

  return { liniesNoResoltes: noResoltes };
}

export async function transformarComanda(
  client: PoolClient,
  wooOrder: WooOrder,
): Promise<ResultatComanda> {
  const existent = await obtenirComandaExistent(client, wooOrder.id);

  if (existent && existent.congelat_a !== null) {
    await registrarIncidencia(
      client,
      existent.id,
      'actualitzacio_sobre_congelada',
      `WooCommerce mandó una actualización (date_modified_gmt=${wooOrder.date_modified_gmt}) para un pedido congelado desde ${existent.congelat_a.toISOString()}.`,
    );
    logger.warn(
      {
        wooOrderId: wooOrder.id,
        comandaId: existent.id,
        congeladaDesde: existent.congelat_a.toISOString(),
      },
      'Actualización de WooCommerce ignorada: el pedido está congelado — se registró como incidencia',
    );
    return { comandaId: existent.id, congelada: true, actualitzada: false, liniesNoResoltes: 0 };
  }

  let comandaId: string;

  if (!existent) {
    comandaId = await crearComanda(client, wooOrder);
  } else {
    comandaId = existent.id;
    const actualizada = await actualitzarCapcaleraSiCorrespon(client, comandaId, wooOrder);
    if (!actualizada) {
      logger.info(
        { wooOrderId: wooOrder.id, comandaId },
        'Versión no más nueva que la almacenada — se omite (guardián de versión)',
      );
      return { comandaId, congelada: false, actualitzada: false, liniesNoResoltes: 0 };
    }
  }

  const { liniesNoResoltes } = await processarLinies(client, comandaId, wooOrder);

  if (liniesNoResoltes > 0) {
    await registrarIncidencia(
      client,
      comandaId,
      'article_no_resolt',
      `${liniesNoResoltes} línea(s) sin artículo resuelto.`,
    );
    logger.warn(
      { wooOrderId: wooOrder.id, comandaId, liniesNoResoltes },
      'Pedido con líneas sin artículo resuelto — se registró como incidencia',
    );
  }

  return { comandaId, congelada: false, actualitzada: true, liniesNoResoltes };
}

export async function transformarComandes(
  pool: Pool = poolPerDefecte,
): Promise<ResultatTransformacioComandes> {
  const crudos = await pool.query<{ woo_id: number; payload: WooOrder }>(
    `SELECT woo_id, payload FROM aterratge_woocommerce WHERE recurs = 'orders' ORDER BY woo_id`,
  );

  const resultat: ResultatTransformacioComandes = {
    comandesProcessades: 0,
    comandesActualitzades: 0,
    comandesCongelades: 0,
    comandesDescartadesPerVersio: 0,
    liniesNoResoltes: 0,
    errors: 0,
  };

  for (const fila of crudos.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await transformarComanda(client, fila.payload);
      await client.query('COMMIT');

      resultat.comandesProcessades++;
      resultat.liniesNoResoltes += r.liniesNoResoltes;
      if (r.congelada) resultat.comandesCongelades++;
      else if (!r.actualitzada) resultat.comandesDescartadesPerVersio++;
      else resultat.comandesActualitzades++;
    } catch (err) {
      await client.query('ROLLBACK');
      resultat.errors++;
      logger.error(
        { wooOrderId: fila.woo_id, error: err instanceof Error ? err.message : String(err) },
        'Falló la transformación de un pedido — se omite y se sigue con el resto',
      );
    } finally {
      client.release();
    }
  }

  logger.info(resultat, 'Transformación de pedidos completada');
  return resultat;
}
