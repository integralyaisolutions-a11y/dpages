import type { Client, Pool, PoolClient } from 'pg';
import type { WooMetaData, WooOrder } from '@dpages/shared';

/** Sólo hace falta `.query()` — acepta Pool, PoolClient o Client suelto (mismo criterio que resolucio-article.ts). */
type Consultable = Pool | PoolClient | Client;

function extraerMetaData(metaData: WooMetaData[], clau: string): string | null {
  const entrada = metaData.find((m) => m.key === clau);
  if (entrada === undefined || typeof entrada.value !== 'string') return null;
  const valor = entrada.value.trim();
  return valor === '' ? null : valor;
}

/**
 * El NIF llega en `meta_data` bajo DOS claves que representan lo mismo
 * (docs/hallazgos-woocommerce.md, verificado también contra los 4.250
 * pedidos reales): `nif` (2.331 casos con valor) y `_billing_myfield5`
 * (812 casos con valor — la clave está presente en casi todos los
 * pedidos, pero vacía la mayoría de las veces). De los 419 pedidos donde
 * ambas vienen con valor, 85 difieren entre sí. Se prioriza `nif` por
 * tener un nombre explícito — es una heurística, no una regla confirmada
 * por el cliente (mismo criterio que `inferirIdiomaHeuristic` en
 * `transform/idioma.ts`: documentada, no silenciosa).
 */
function extraerNif(wooOrder: WooOrder): string | null {
  return (
    extraerMetaData(wooOrder.meta_data, 'nif') ??
    extraerMetaData(wooOrder.meta_data, '_billing_myfield5')
  );
}

function extraerEmail(wooOrder: WooOrder): string | null {
  const email = wooOrder.billing.email.trim().toLowerCase();
  return email === '' ? null : email;
}

function extraerNom(wooOrder: WooOrder): string | null {
  const nom = `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`.trim();
  return nom === '' ? null : nom;
}

function extraerOpcional(valor: string | undefined): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

/**
 * Resuelve el cliente de un pedido — primero por NIF, si no por email
 * (criterio confirmado para esta capa). `null` si no hay ninguno de los
 * dos (en la práctica, casi nunca: el email tiene 100% de cobertura en los
 * pedidos reales).
 *
 * Upsert atómico (`INSERT ... ON CONFLICT`), no "SELECT y después INSERT":
 * dos pedidos del MISMO cliente nuevo pueden procesarse casi al mismo
 * tiempo (webhook + polling) y el lock de concurrencia de
 * `transformarComanda` es por `woo_order_id`, no por cliente — no los
 * serializa entre sí. El upsert nunca pisa un dato que la oficina ya haya
 * cargado a mano vía `PATCH /clients/:id` (`COALESCE(client.columna, ...)`
 * en el `DO UPDATE`, sólo completa huecos).
 */
export async function resolverOCrearClient(
  client: Consultable,
  wooOrder: WooOrder,
): Promise<string | null> {
  const nif = extraerNif(wooOrder);
  const email = extraerEmail(wooOrder);
  if (nif === null && email === null) return null;

  const valores = [
    nif,
    email,
    extraerNom(wooOrder),
    extraerOpcional(wooOrder.billing.phone),
    extraerOpcional(wooOrder.billing.city),
    wooOrder.customer_id > 0 ? wooOrder.customer_id : null,
    wooOrder.customer_id === 0,
  ];

  // Sólo dos valores posibles, fijados acá mismo — nunca viene de la
  // petición, así que interpolarlo en el SQL no es una inyección.
  const columnaConflicto = nif !== null ? 'nif' : 'email';
  const res = await client.query<{ id: string }>(
    `INSERT INTO client (nif, email, nom, telefon, poblacio, woo_customer_id, es_convidat)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (${columnaConflicto}) WHERE ${columnaConflicto} IS NOT NULL DO UPDATE SET
       nif = COALESCE(client.nif, EXCLUDED.nif),
       email = COALESCE(client.email, EXCLUDED.email),
       nom = COALESCE(client.nom, EXCLUDED.nom),
       telefon = COALESCE(client.telefon, EXCLUDED.telefon),
       poblacio = COALESCE(client.poblacio, EXCLUDED.poblacio),
       woo_customer_id = COALESCE(client.woo_customer_id, EXCLUDED.woo_customer_id)
     RETURNING id`,
    valores,
  );
  return res.rows[0]!.id;
}
