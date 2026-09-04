/**
 * Capa 51 — de un solo uso. Carga COMPLETA del catálogo real de WooCommerce
 * (no incremental) — paso previo a un reset controlado de producción (fase
 * pre-productiva, ADR-007 permite esto). Distinta de sync-cataleg
 * (incremental, por cursor): acá se trae TODO, no sólo lo modificado
 * recientemente.
 *
 * Reusa el 100% de la lógica existente, sin reescribir nada — auditado
 * antes de escribir esto (capa 51, ver resumen de la auditoría):
 *   - `listarProductos()` (woocommerce/cliente.ts) llamado sin
 *     `modifiedAfter` ya trae el catálogo completo — no hizo falta ningún
 *     cambio ahí, el filtro siempre fue opcional.
 *   - `ingerirCataleg()` (sync/ingesta.ts) con `modifiedAfterForcat` fijado
 *     a una fecha deliberadamente anterior a que la tienda exista —
 *     funcionalmente "sin filtro" (WooCommerce filtra
 *     `date_modified_gmt > modified_after`). Aterriza TODO en
 *     `aterratge_woocommerce` (mismo upsert idempotente de siempre) y, de
 *     paso, avanza el cursor de `'products'` a la fecha de modificación más
 *     reciente vista — un `sync-cataleg` incremental normal vuelve a
 *     funcionar bien después, sin tocar el cursor a mano.
 *   - `transformarCataleg()` (transform/cataleg.ts) SIN CAMBIOS: ya procesa
 *     TODO lo aterrizado (no sólo lo reciente), ya resuelve el duplicado
 *     por idioma (ADR-008) por `codi` sin crear un `producte` repetido, y
 *     ya deja `agrupacio_produccio`/`agrupacio_rendiment`/`format`/`envasat`
 *     en NULL — el `INSERT` no los toca, quedan para que Francesc los
 *     complete después.
 *
 * Dry-run por defecto: sólo LEE de WooCommerce real (ninguna escritura —
 * estructuralmente imposible contra WooCommerce, ver cliente.ts — ni contra
 * la base), reporta cuántos productos traería y de qué categorías.
 * `--aplicar` aterriza y transforma de verdad.
 *
 * IMPORTANTE — WC_BASE_URL: fuera de `NODE_ENV=production`, `config/env.ts`
 * EXIGE que `WC_BASE_URL` sea un host de prueba (localhost/*.test/*.invalid)
 * — guarda deliberada para que una prueba manual no pueda pegarle por
 * accidente a la tienda real. Para traer el catálogo REAL hace falta
 * invocar con `NODE_ENV=production` explícito — no es un workaround del
 * guard, es exactamente para lo que existe esa variable (ver el comentario
 * en `config/env.ts`). `AUTH_DISABLED=false` ya está en `.env`, así que no
 * choca con la otra mitad de esa misma guarda (producción no admite auth
 * apagada) — este script tampoco pasa nunca por Fastify/autenticación, sólo
 * usa `config/env.ts` para `DATABASE_URL`/`WC_*`.
 *
 * Uso (ver README.md de scripts/ para el detalle):
 *   NODE_ENV=production tsx --env-file-if-exists=../../.env src/scripts/carga-completa-cataleg.ts
 *   NODE_ENV=production tsx --env-file-if-exists=../../.env src/scripts/carga-completa-cataleg.ts --aplicar
 */
import { pathToFileURL } from 'node:url';
import type { WooProduct } from '@dpages/shared';
import { cerrarPool, pool as poolPerDefecte } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { ingerirCataleg } from '../sync/ingesta.js';
import { transformarCataleg } from '../transform/cataleg.js';
import { listarProductos } from '../woocommerce/cliente.js';

/**
 * Anterior a que dpages.cat exista — WooCommerce filtra
 * `date_modified_gmt > modified_after`, así que esta fecha es
 * funcionalmente "sin filtro" (trae todo). Mismo formato que usa el resto
 * del sync (`sync/fechas.ts`): sin milisegundos ni "Z".
 */
const DESDE_SIEMPRE = '2000-01-01T00:00:00';

/** Cuenta productos por primera categoría — mismo criterio que `obtenirOCrearArticle` (transform/cataleg.ts) para decidir la categoría del producte. */
export function contarPorCategoria(
  productos: readonly Pick<WooProduct, 'categories'>[],
): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const producto of productos) {
    const nombre = producto.categories[0]?.name ?? '(sin categoría)';
    conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
  }
  return conteo;
}

/** Mismo criterio que `skuNet` en transform/cataleg.ts (no exportada ahí) — sin SKU no se crea producte (ADR-018). */
export function contarSinSku(productos: readonly Pick<WooProduct, 'sku'>[]): number {
  return productos.filter((p) => !p.sku || p.sku.trim() === '').length;
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');

  if (!aplicar) {
    console.log(
      'Modo DRY-RUN — consultando el catálogo completo real de WooCommerce (sólo lectura)...',
    );
    const productos = await listarProductos(); // sin modifiedAfter = catálogo completo

    console.log(`\n=== ${productos.length} productos reales en WooCommerce ===\n`);
    const porCategoria = [...contarPorCategoria(productos).entries()].sort((a, b) => b[1] - a[1]);
    for (const [categoria, cantidad] of porCategoria) {
      console.log(`  ${categoria}: ${cantidad}`);
    }
    console.log(
      `\n  Sin SKU (no se crea producte, queda como incidencia): ${contarSinSku(productos)}`,
    );
    console.log('\nNo se escribió nada. Correr con --aplicar para cargar de verdad.');
    return;
  }

  console.log('--aplicar: aterrizando el catálogo completo (ingerirCataleg, sin cambios)...');
  const resultatIngesta = await ingerirCataleg(poolPerDefecte, {
    modifiedAfterForcat: DESDE_SIEMPRE,
  });
  console.log(`Ingesta completada: ${resultatIngesta.itemsProcessats} productos aterrizados.`);

  console.log('Transformando (transformarCataleg, sin cambios)...');
  const resultatTransform = await transformarCataleg(poolPerDefecte);
  console.log(resultatTransform);
}

const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  main()
    .catch((err: unknown) => {
      logger.error({ err }, 'carga-completa-cataleg falló');
      process.exitCode = 1;
    })
    .finally(() => cerrarPool());
}
