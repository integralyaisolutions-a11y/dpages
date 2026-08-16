/**
 * Limpieza de datos de DESARROLLO local — no es una migración de esquema,
 * no toca ninguna migración numerada. Borra los pedidos anteriores a una
 * fecha de corte (por defecto 2026-08-01) del histórico completo de
 * WooCommerce que se trajo puntualmente para diagnosticar dos bugs
 * (resolución de cliente y conflictos de identidad), para que la base local
 * vuelva a ser representativa del volumen real de producción.
 *
 * IMPORTANTE — por qué filtra por aterratge_woocommerce y no por
 * comanda.creat_en: `creat_en` es cuándo la fila entró a NUESTRA base, no
 * cuándo se hizo el pedido en WooCommerce. Como el histórico se trajo en un
 * solo lote, las 4.250 filas tienen `creat_en` clavado en un rango de
 * minutos (verificado: todas entre las 19:57 y las 19:59 del mismo día) —
 * filtrar por ahí borraría todo o nada, nunca lo correcto. La fecha real del
 * pedido sólo está en el crudo (`aterratge_woocommerce.payload->>
 * 'date_created_gmt'`), así que el criterio de corte se aplica ahí y se
 * propaga a `comanda` por `woo_order_id`.
 *
 * Orden de borrado (por FK — comanda_linia e incidencia_comanda tienen
 * ON DELETE CASCADE hacia comanda, pero se listan explícitas para tener el
 * conteo de cada paso en el resumen final, no por necesidad del esquema):
 *   1. incidencia_comanda
 *   2. comanda_linia
 *   3. comanda
 *   4. aterratge_woocommerce (recurs='orders', misma fecha de corte)
 *   5. cursor_sincronitzacio (recurs='orders') — se borra la fila entera,
 *      no se pone cursor_en en NULL: con la fila ausente, la próxima
 *      ingesta la trata como "sin cursor previo" y aplica la ventana de
 *      INGESTA_DIES_ENRERE_DEFECTE (30 días) en vez de traer el histórico
 *      completo de nuevo (ver sync/ingesta.ts, ADR-017).
 *
 * NO toca producte, categoria_producte, client ni transportista — un
 * artículo o un cliente puede seguir siendo válido aunque el pedido que lo
 * originó se borre. Los clientes que quedan sin ningún pedido posterior a
 * la fecha de corte NO se borran acá — sólo se cuentan y se reportan.
 *
 * Uso: tsx src/scripts/netejar-historic-desenvolupament.ts [fecha ISO de corte]
 *      (default: 2026-08-01T00:00:00Z)
 */
import { env } from '../config/env.js';
import { cerrarPool, pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';

const RECURS_COMANDES = 'orders';
const DATA_TALL_DEFECTE = '2026-08-01T00:00:00Z';

async function main(): Promise<void> {
  // Mismo criterio que las guardas de WC_BASE_URL/AUTH_DISABLED/CORS_ORIGIN
  // (config/env.ts): un script destructivo de "datos de desarrollo" no
  // tiene que poder correr nunca contra lo que DATABASE_URL apunte en
  // producción, ni por descuido de una .env mal cambiada.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Este script borra datos y es sólo para desarrollo local — rechazado con NODE_ENV=production.',
    );
  }

  const dataTall = process.argv[2] ?? DATA_TALL_DEFECTE;
  if (Number.isNaN(Date.parse(dataTall))) {
    throw new Error(`"${dataTall}" no es una fecha ISO válida.`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `CREATE TEMP TABLE _comandes_antigues ON COMMIT DROP AS
       SELECT c.id FROM comanda c
       JOIN aterratge_woocommerce a
         ON a.recurs = $1 AND a.woo_id = c.woo_order_id
       WHERE (a.payload->>'date_created_gmt')::timestamptz < $2::timestamptz`,
      [RECURS_COMANDES, dataTall],
    );
    const { rows: totalRows } = await client.query<{ count: string }>(
      'SELECT count(*) FROM _comandes_antigues',
    );
    const comandesIdentificades = Number(totalRows[0]!.count);

    // Clientes que quedarían sin NINGÚN pedido posterior a la fecha de
    // corte — huérfanos, pero NO se borran acá (decisión aparte). Se
    // calcula ANTES de borrar nada: después, la comparación "tiene pedidos
    // fuera del lote a borrar" ya no se puede hacer contra el lote borrado.
    const { rows: orfensRows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM client cl
       WHERE EXISTS (
         SELECT 1 FROM comanda c WHERE c.client_id = cl.id AND c.id IN (SELECT id FROM _comandes_antigues)
       )
       AND NOT EXISTS (
         SELECT 1 FROM comanda c WHERE c.client_id = cl.id AND c.id NOT IN (SELECT id FROM _comandes_antigues)
       )`,
    );
    const clientsOrfens = Number(orfensRows[0]!.count);

    const incidencies = await client.query(
      'DELETE FROM incidencia_comanda WHERE comanda_id IN (SELECT id FROM _comandes_antigues)',
    );
    const linies = await client.query(
      'DELETE FROM comanda_linia WHERE comanda_id IN (SELECT id FROM _comandes_antigues)',
    );
    const comandes = await client.query(
      'DELETE FROM comanda WHERE id IN (SELECT id FROM _comandes_antigues)',
    );
    const aterratge = await client.query(
      `DELETE FROM aterratge_woocommerce
       WHERE recurs = $1 AND (payload->>'date_created_gmt')::timestamptz < $2::timestamptz`,
      [RECURS_COMANDES, dataTall],
    );
    const cursor = await client.query('DELETE FROM cursor_sincronitzacio WHERE recurs = $1', [
      RECURS_COMANDES,
    ]);

    await client.query('COMMIT');

    console.log({
      dataTall,
      comandesIdentificades,
      incidenciesEsborrades: incidencies.rowCount,
      liniesEsborrades: linies.rowCount,
      comandesEsborrades: comandes.rowCount,
      aterratgeEsborrat: aterratge.rowCount,
      cursorReiniciat: cursor.rowCount,
      clientsOrfensSenseEsborrar: clientsOrfens,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err: unknown) => {
    logger.error(
      { err },
      'La limpieza del histórico de desarrollo falló — nada se borró (ROLLBACK)',
    );
    process.exitCode = 1;
  })
  .finally(() => cerrarPool());
