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
}

function skuNet(producto: Pick<WooProduct, 'sku'>): string | null {
  return producto.sku && producto.sku.trim() !== '' ? producto.sku.trim() : null;
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
 */
async function obtenirOCrearArticle(
  client: PoolClient,
  producto: WooProduct,
): Promise<{ producteId: string; creat: boolean; categoriaCreada: boolean }> {
  const sku = skuNet(producto);

  if (sku !== null) {
    const existent = await client.query<{ id: string }>('SELECT id FROM producte WHERE codi = $1', [
      sku,
    ]);
    if (existent.rows[0])
      return { producteId: existent.rows[0].id, creat: false, categoriaCreada: false };
  }

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

      const idioma = inferirIdiomaHeuristic(producto);
      const { producteId, creat, categoriaCreada } = await obtenirOCrearArticle(client, producto);
      if (creat) articlesCreats++;
      if (categoriaCreada) categoriesCreades++;

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
  };
  logger.info(resultado, 'Transformación de catálogo completada');
  return resultado;
}
