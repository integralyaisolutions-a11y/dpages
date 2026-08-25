/**
 * Backfill (capa 25, una sola vez): asigna `codi` a clientes YA
 * sincronizados desde WooCommerce que quedaron sin código antes de que el
 * sync empezara a generarlo automáticamente (ver
 * `transform/resolucio-client.ts`, `resolverOCrearClient`).
 *
 * IMPORTANTE — `client` NO tiene columna `origen_id` (a diferencia de
 * `comanda`): verificado contra el esquema (migraciones 0003, 0008, 0009,
 * 0015 — ninguna agrega `origen_id` a `client`). El criterio para
 * identificar "vino del sync" es estructural, no una columna: `POST
 * /clients` (alta manual, `rutes/api/clients.ts`) exige `codi` como campo
 * obligatorio, y es el ÚNICO otro camino de alta de `client` en todo el
 * sistema (la carga inicial por xlsx, `carga-inicial/importar-clients.ts`,
 * también valida `codi` como obligatorio). Por lo tanto, cualquier fila
 * real con `codi` en blanco sólo pudo haberse creado por
 * `resolverOCrearClient()` — nunca por alta manual. Filtrar por "codi en
 * blanco" es equivalente a filtrar por "origen woocommerce", sin necesitar
 * (ni inventar) una columna que no existe.
 *
 * Mismo patrón que el sync desde capa 25 (`CLI` + id_seq, SIN padding
 * fijo — un ancho fijo de 3 dígitos truncaba en vez de ensanchar en cuanto
 * `id_seq` llegaba a 4 cifras; bug real encontrado contra datos reales,
 * ver `transform/resolucio-client.ts` para el detalle). Acá el `id_seq` YA
 * existe (la fila se insertó hace tiempo); no hay nada que generar, sólo
 * leer y volcar en una sola sentencia.
 *
 * Idempotente: sólo toca filas con `codi` NULL o vacío — correrlo de nuevo
 * sobre clientes que ya tienen `codi` (asignado por este mismo script, o
 * por el sync desde que existe capa 25) no hace nada.
 *
 * NO es destructivo (sólo completa un campo vacío, nunca borra ni
 * sobrescribe un `codi` existente) — a diferencia de
 * `carga-inicial/reset-carga-inicial.ts`, no pide confirmación ni bloquea
 * producción: está pensado para correr tanto en local como contra Cloud
 * SQL real.
 *
 * Uso: tsx --env-file-if-exists=../.env src/scripts/backfill-codi-clients-woocommerce.ts
 */
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { cerrarPool, pool as poolPerDefecte } from '../db/pool.js';
import { logger } from '../lib/logger.js';

export interface ResultatBackfillCodiClients {
  actualitzats: number;
}

/**
 * Pura respecto del entry point — inyecta `dbPool` para poder testear sin
 * pasar por `main()`. Una sola transacción: o se actualizan todas las
 * filas candidatas, o ninguna.
 */
export async function backfillCodiClientsWoocommerce(
  dbPool: Pool,
): Promise<ResultatBackfillCodiClients> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await client.query(
      `UPDATE client SET codi = 'CLI' || id_seq::text
       WHERE codi IS NULL OR codi = ''`,
    );
    await client.query('COMMIT');
    return { actualitzats: resultat.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const resultat = await backfillCodiClientsWoocommerce(poolPerDefecte);
  console.log(`Clients actualitzats amb codi nou: ${resultat.actualitzats}`);
}

const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  main()
    .catch((err: unknown) => {
      logger.error(
        { err },
        'El backfill de codi de clients va fallar — res es va actualitzar (ROLLBACK)',
      );
      process.exitCode = 1;
    })
    .finally(() => cerrarPool());
}
