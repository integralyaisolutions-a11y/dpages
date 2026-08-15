import type { Pool, PoolClient } from 'pg';
import type { WooProduct } from '@dpages/shared';
import { pool as poolPerDefecte } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { inferirIdiomaHeuristic, resolverNomCategoriaCanonic } from './idioma.js';

export interface ResultatTransformacioCataleg {
  productesProcessats: number;
  articlesCreats: number;
  aliasCreats: number;
  categoriesCreades: number;
  /** Productos de WooCommerce sin SKU: no se crea producte, se registra incidencia (ver ADR-018). */
  productesSenseSku: number;
}

function skuNet(producto: Pick<WooProduct, 'sku'>): string | null {
  return producto.sku && producto.sku.trim() !== '' ? producto.sku.trim() : null;
}

/**
 * "Se registra como incidencia" (ADR-018), mismo patrón que
 * `incidencia_comanda` pero sin comanda de por medio: la referencia es al
 * producto de WooCommerce (no hay ningún `producte` que referenciar,
 * justamente porque no se crea ninguno). El índice único parcial
 * (woo_product_id WHERE NOT resolta) hace que reintentar esto en la
 * próxima corrida de sync no acumule una fila nueva mientras el producto
 * siga sin SKU.
 */
async function registrarIncidenciaCataleg(
  client: PoolClient,
  wooProductId: number,
  tipus: string,
  detall: string,
): Promise<void> {
  await client.query(
    `INSERT INTO incidencia_cataleg (woo_product_id, tipus, detall)
     VALUES ($1, $2, $3)
     ON CONFLICT (woo_product_id) WHERE NOT resolta DO NOTHING`,
    [wooProductId, tipus, detall],
  );
}

/**
 * Categorías (confirmadas: existen en WooCommerce, catálogo y obrador
 * filtran por ellas — sólo `agrupacioRendiment` queda pendiente). También
 * duplicadas por idioma: se resuelven por nombre CANÓNICO, no por el
 * nombre crudo de WooCommerce, para que "Fresc" y "Fresco" no terminen
 * siendo dos categorías distintas.
 */
async function obtenirOCrearCategoria(
  client: PoolClient,
  nomCanonic: string,
): Promise<{ categoriaId: string; creada: boolean }> {
  const existent = await client.query<{ id: string }>(
    'SELECT id FROM categoria_producte WHERE nom = $1',
    [nomCanonic],
  );
  if (existent.rows[0]) return { categoriaId: existent.rows[0].id, creada: false };

  const nova = await client.query<{ id: string }>(
    'INSERT INTO categoria_producte (nom) VALUES ($1) RETURNING id',
    [nomCanonic],
  );
  return { categoriaId: nova.rows[0]!.id, creada: true };
}

/**
 * La duplicación de idioma (ADR-008): un mismo artículo llega en DOS
 * productos de WooCommerce con el mismo código. Si ya existe un `producte`
 * con ese código, lo reutiliza — el artículo es uno solo. Si no, lo crea.
 * `categoria_id` se resuelve desde `categories[0]` del payload (pedido
 * explícito) sólo al CREAR el artículo — igual que `nom`, no se resincroniza
 * en corridas posteriores.
 *
 * `null` = el producto de WooCommerce no tiene SKU. NUNCA se crea un
 * `producte` en ese caso (ADR-018, mismo criterio que la resolución de
 * artículo de líneas de pedido en `resolucio-article.ts`) — el llamador
 * registra la incidencia.
 */
async function obtenirOCrearArticle(
  client: PoolClient,
  producto: WooProduct,
): Promise<{ producteId: string; creat: boolean; categoriaCreada: boolean } | null> {
  const sku = skuNet(producto);
  if (sku === null) return null;

  const existent = await client.query<{ id: string }>('SELECT id FROM producte WHERE codi = $1', [
    sku,
  ]);
  if (existent.rows[0])
    return { producteId: existent.rows[0].id, creat: false, categoriaCreada: false };

  let categoriaId: string | null = null;
  let categoriaCreada = false;
  const primeraCategoria = producto.categories[0];
  if (primeraCategoria) {
    const nomCanonic = resolverNomCategoriaCanonic(primeraCategoria.name);
    const resultat = await obtenirOCrearCategoria(client, nomCanonic);
    categoriaId = resultat.categoriaId;
    categoriaCreada = resultat.creada;
  }

  const nuevo = await client.query<{ id: string }>(
    `INSERT INTO producte (codi, nom, actiu, categoria_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [sku, producto.name, producto.status === 'publish', categoriaId],
  );
  return { producteId: nuevo.rows[0]!.id, creat: true, categoriaCreada };
}

/**
 * Crea `producte`/`alias_producte`/`categoria_producte` a partir de lo
 * aterrizado crudo (`aterratge_woocommerce`, recurs='products'). Sólo
 * maneja el producto en sí (woo_variation_id = 0) — las variaciones tienen
 * su propio endpoint de WooCommerce que todavía no se ingiere (ver capa de
 * ingesta); un alias por variación se agrega cuando esa ingesta exista, no
 * acá.
 */
export async function transformarCataleg(
  pool: Pool = poolPerDefecte,
): Promise<ResultatTransformacioCataleg> {
  const crudos = await pool.query<{ woo_id: number; payload: WooProduct }>(
    `SELECT woo_id, payload FROM aterratge_woocommerce WHERE recurs = 'products'`,
  );

  let articlesCreats = 0;
  let aliasCreats = 0;
  let categoriesCreades = 0;
  let productesSenseSku = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const fila of crudos.rows) {
      const producto = fila.payload;

      const aliasExistent = await client.query<{ producte_id: string }>(
        'SELECT producte_id FROM alias_producte WHERE woo_product_id = $1 AND woo_variation_id = 0',
        [producto.id],
      );
      if (aliasExistent.rows[0]) continue; // ya visto en una corrida anterior

      const incidenciaExistent = await client.query(
        'SELECT 1 FROM incidencia_cataleg WHERE woo_product_id = $1 AND NOT resolta',
        [producto.id],
      );
      if (incidenciaExistent.rows[0]) continue; // ya se registró que no tiene SKU, no se repite cada corrida

      const resultatArticle = await obtenirOCrearArticle(client, producto);

      if (resultatArticle === null) {
        await registrarIncidenciaCataleg(
          client,
          producto.id,
          'article_sense_sku',
          `El producte de WooCommerce "${producto.name}" (id ${producto.id}) no té SKU — no es crea cap producte fins que en tingui.`,
        );
        productesSenseSku++;
        logger.warn(
          { wooProductId: producto.id },
          'Producto de WooCommerce sin SKU — no se crea producte, se registró como incidencia',
        );
        continue;
      }

      const { producteId, creat, categoriaCreada } = resultatArticle;
      if (creat) articlesCreats++;
      if (categoriaCreada) categoriesCreades++;

      const idioma = inferirIdiomaHeuristic(producto);
      await client.query(
        `INSERT INTO alias_producte (producte_id, woo_product_id, woo_variation_id, idioma, codi)
         VALUES ($1, $2, 0, $3, $4)`,
        [producteId, producto.id, idioma, skuNet(producto)],
      );
      aliasCreats++;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const resultado: ResultatTransformacioCataleg = {
    productesProcessats: crudos.rowCount ?? 0,
    articlesCreats,
    aliasCreats,
    categoriesCreades,
    productesSenseSku,
  };
  logger.info(resultado, 'Transformación de catálogo completada');
  return resultado;
}
