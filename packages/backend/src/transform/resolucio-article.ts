import type { Client, Pool, PoolClient } from 'pg';

/** Acepta Pool, PoolClient o Client: en tests se resuelve con un Client suelto; en runtime, con el Pool o un client de una transacción. */
type Consultable = Pool | PoolClient | Client;

export interface ResolucioArticle {
  producteId: string;
  /** Qué alias concreto resolvió la línea. Null cuando resolvió por SKU (paso 3): ahí no hay una fila de alias de por medio. */
  aliasProducteId: string | null;
}

/**
 * Resolución de artículo, en este orden exacto (ver ADR-008):
 *   1. Alias exacto por (woo_product_id, woo_variation_id).
 *   2. Alias del producto padre (woo_variation_id = 0) — cubre el caso de
 *      una variación concreta que todavía no tiene su propio alias (la
 *      ingesta de variaciones no existe todavía, ver capa de ingesta).
 *   3. Por código de artículo (SKU de la línea).
 *   4. Sin resolver — null. El llamador NO descarta la línea: la guarda
 *      con producte_id nulo y registra una incidencia (14 artículos
 *      publicados sin código, incluido el 3.º más vendido).
 */
export async function resolverArticle(
  db: Consultable,
  wooProductId: number,
  wooVariationId: number,
  sku: string | null,
): Promise<ResolucioArticle | null> {
  const exacte = await db.query<{ id: string; producte_id: string }>(
    'SELECT id, producte_id FROM alias_producte WHERE woo_product_id = $1 AND woo_variation_id = $2',
    [wooProductId, wooVariationId],
  );
  if (exacte.rows[0]) {
    return { producteId: exacte.rows[0].producte_id, aliasProducteId: exacte.rows[0].id };
  }

  if (wooVariationId !== 0) {
    const delPadre = await db.query<{ id: string; producte_id: string }>(
      'SELECT id, producte_id FROM alias_producte WHERE woo_product_id = $1 AND woo_variation_id = 0',
      [wooProductId],
    );
    if (delPadre.rows[0]) {
      return { producteId: delPadre.rows[0].producte_id, aliasProducteId: delPadre.rows[0].id };
    }
  }

  if (sku !== null && sku.trim() !== '') {
    const perCodi = await db.query<{ id: string }>('SELECT id FROM producte WHERE codi = $1', [
      sku,
    ]);
    if (perCodi.rows[0]) {
      return { producteId: perCodi.rows[0].id, aliasProducteId: null };
    }
  }

  return null;
}
