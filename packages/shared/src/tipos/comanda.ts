/**
 * Los cuatro estados de pedido, cerrados con el cliente. No renombrar sin
 * actualizar también las cuatro pantallas que los muestran.
 */
export const ESTATS_COMANDA = ['oberta', 'en_proces', 'tancada', 'amb_incidencia'] as const;
export type EstatComanda = (typeof ESTATS_COMANDA)[number];

/**
 * Canal de entrada del pedido. La web es un canal más (16-20% del volumen),
 * no la fuente de verdad del sistema.
 */
export const CANALS_ORIGEN = ['web', 'email', 'whatsapp', 'telefon'] as const;
export type CanalOrigen = (typeof CANALS_ORIGEN)[number];

export interface Comanda {
  id: string;
  /** null en pedidos capturados a mano (email/WhatsApp/teléfono). */
  wooOrderId: number | null;
  origen: CanalOrigen;
  estat: EstatComanda;
  /** Regla de congelación (ADR-007): null = no congelada; si no, cuándo entró en producción y el sync dejó de sobrescribirla. */
  congelatA: string | null;
  clientId: string | null;

  // Propiedad de WooCommerce (ADR-005): el sync puede sobrescribir estos
  // campos mientras `congelatA` sea null.
  /** Status crudo de WooCommerce (processing/completed/...) — distinto de `estat`, que es el flujo operativo propio. Null en pedidos que no vienen de Woo. */
  estatWeb: string | null;
  poblacioDesti: string | null;
  /** Con IVA, tal como llega de WooCommerce. NUMERIC(10,2) como string. */
  total: string | null;

  // Propiedad del sistema (ADR-005): el sync nunca los toca.
  dataProduccio: string | null;
  dataExpedicio: string | null;
  dataEntrega: string | null;
  transportistaId: string | null;
  tarifaId: string | null;
  observacions: string | null;

  dataCreacio: string;
  /** date_modified_gmt de WooCommerce (UTC, TIMESTAMPTZ); guardián de versión, ver ADR-004. */
  dataModificacioWoo: string | null;
}

export interface ComandaLinia {
  id: string;
  comandaId: string;
  ordinal: number;
  /** Inestable: WooCommerce recrea los ids al editar un pedido desde el admin. Ver ADR-006. */
  wooLineItemId: number | null;
  /**
   * Artículo canónico. Null cuando la resolución de artículo no encontró
   * nada (ej. los 14 artículos publicados sin código) — la línea NO se
   * descarta, se guarda igual y la comanda queda con incidencia.
   */
  producteId: string | null;
  /** Qué alias (idioma/variación) concreto resolvió esta línea. Null si no se resolvió o si el pedido no vino de WooCommerce. Sólo trazabilidad. */
  aliasProducteId: string | null;
  /** Traza cruda de WooCommerce (product_id/variation_id/sku de la línea), aunque la resolución falle. Null en líneas que no vienen de Woo. */
  wooProductId: number | null;
  wooVariationId: number | null;
  wooSku: string | null;

  // Propiedad de WooCommerce
  unitatsDemanades: number;
  /** Sin IVA, tal como llega de WooCommerce. NUMERIC(10,2) como string. */
  preuUnitari: string;

  /** Peso de ficha del artículo (NUMERIC(10,3), kg). Null si el artículo es "a medida" o no se resolvió. */
  pesFitxaKg: string | null;
  /** unitatsDemanades × pesFitxaKg. 0 cuando es "a medida" (pesEditable=true) — es un estado válido, a la espera de que alguien lo complete. */
  pesCalculatKg: string;
  pesEditable: boolean;

  // Propiedad del sistema — panel de empaquetado. Obligatorios, arrancan en 0
  // (0 es válido acá: es el estado antes de empaquetar), requieren
  // confirmación explícita aunque coincidan con lo pedido.
  unitatsLliurades: number;
  kgLliurats: string;
  /**
   * Null = todavía no se confirmó. No es un booleano a propósito: la
   * diferencia entre lo pedido y lo entregado determina si se emite un
   * abono o se cobra de más, y hace falta saber CUÁNDO se confirmó cada
   * línea, no sólo que alguien lo hizo. Mismo patrón que `congelatA`.
   */
  confirmatA: string | null;
  /** Quién confirmó (uid de Firebase Auth). Nullable: la tabla de usuarios llega en una capa posterior. */
  confirmatPer: string | null;

  /** Borrado lógico (ADR-006): la línea ya no viene de WooCommerce, pero nunca se elimina físicamente. */
  esborrat: boolean;
}
