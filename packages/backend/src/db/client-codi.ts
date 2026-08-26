import type { Client, Pool, PoolClient } from 'pg';

/** Sólo hace falta `.query()` — acepta Pool, PoolClient o Client suelto (mismo criterio que resolucio-article.ts/resolucio-client.ts). */
type Consultable = Pool | PoolClient | Client;

/**
 * Codi automático de un cliente recién insertado: `CLI` + `id_seq`, SIN
 * padding fijo. Compartida entre el sync de WooCommerce
 * (`transform/resolucio-client.ts`, `resolverOCrearClient`, capa 25) y el
 * alta manual (`POST /clients`, capa 29) — las dos son, estructuralmente,
 * "insertar una fila de client y resolverle un codi después", porque
 * `id_seq` (columna IDENTITY) recién se conoce DESPUÉS del INSERT, nunca
 * antes ni dentro de la misma sentencia.
 *
 * Un ancho fijo (ej. zero-padded a 3 dígitos) truncaba en vez de ensanchar
 * en cuanto `id_seq` llegaba a 4 cifras — bug real encontrado contra datos
 * reales en capa 25 (id_seq 4916/4918 colisionaban en el mismo "CLI491",
 * violando `idx_client_codi`). No repetir ese error: sin padding, nunca
 * hay ancho fijo que truncar.
 *
 * `WHERE codi IS NULL OR codi = ''` hace que llamarla sea segura incluso
 * si la fila ya tuviera codi por algún motivo (nunca lo pisa) — en la
 * práctica, en los dos caminos que la llaman, la fila se insertó un
 * instante antes sin codi, así que esto es una red de seguridad, no el
 * camino esperado. `codi` es de sólo lectura para siempre una vez
 * asignado (ningún endpoint lo acepta como entrada editable).
 */
export async function assignarCodiAutogenerat(
  client: Consultable,
  id: string,
  idSeq: string,
): Promise<string> {
  const codi = `CLI${idSeq}`;
  await client.query(`UPDATE client SET codi = $1 WHERE id = $2 AND (codi IS NULL OR codi = '')`, [
    codi,
    id,
  ]);
  return codi;
}
