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
export const CANALS_ORIGEN = ['web', 'correu', 'whatsapp', 'telefon'] as const;
export type CanalOrigen = (typeof CANALS_ORIGEN)[number];

export interface Comanda {
  id: string;
  /** null en pedidos capturados a mano (correo/WhatsApp/teléfono). */
  wooOrderId: number | null;
  origen: CanalOrigen;
  estat: EstatComanda;
  /** Regla de congelación (ADR-007): una vez true, el sync deja de sobrescribir esta comanda. */
  congelada: boolean;
  clientId: string | null;

  // Propiedad de WooCommerce (ADR-005): el sync puede sobrescribir estos
  // campos mientras `congelada` sea false.
  poblacioDesti: string | null;
  /** Con IVA, tal como llega de WooCommerce. */
  total: string | null;

  // Propiedad del sistema (ADR-005): el sync nunca los toca.
  dataProduccio: string | null;
  dataExpedicio: string | null;
  dataEntrega: string | null;
  transportistaId: string | null;
  tarifaId: string | null;
  observacions: string | null;

  dataCreacio: string;
  /** date_modified_gmt de WooCommerce; guardián de versión, ver ADR-004. */
  dataModificacioWoo: string | null;
}

export interface ComandaLinia {
  id: string;
  comandaId: string;
  ordinal: number;
  /** Inestable: WooCommerce recrea los ids al editar un pedido desde el admin. Ver ADR-006. */
  wooLineItemId: number | null;
  productAliasId: string;

  // Propiedad de WooCommerce
  unitatsDemanades: number;
  /** Sin IVA, decimales largos tal como llega de WooCommerce. */
  preuUnitari: string;

  /** Peso de ficha del artículo (NUMERIC(10,3), kg). Null si el artículo es "a medida". */
  pesFitxaKg: string | null;
  /** unitatsDemanades × pesFitxaKg. Sólo editable cuando pesFitxaKg es null. */
  pesCalculatKg: string;
  pesEditable: boolean;

  // Propiedad del sistema — panel de empaquetado. Obligatorios, arrancan en 0,
  // requieren confirmación explícita aunque coincidan con lo pedido.
  unitatsEnviades: number;
  kilosEnviats: string;
  confirmatEmpaquetat: boolean;

  /** Borrado lógico: la línea ya no viene de WooCommerce, pero nunca se elimina físicamente. */
  esborrada: boolean;
}
