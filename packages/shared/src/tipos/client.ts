export interface Client {
  id: string;
  /** null si esConvidat. */
  wooCustomerId: number | null;
  esConvidat: boolean;
  /** Cobertura ~57% en los pedidos históricos; puede venir de dos campos de WooCommerce que a veces discrepan. */
  nif: string | null;
  email: string | null;
  /**
   * `null` para clientes manuales — no se usa código para ellos. Si el
   * cliente viene de WooCommerce con código, se conserva.
   */
  codi: string | null;
}

export interface Transportista {
  id: string;
  nom: string;
  /** Texto libre, definido por el usuario al dar de alta — pensado para ser nemotécnico, ej. "TR-DHL". */
  codi: string | null;
}

/** Definición final (importe fijo, por franja, etc.) pendiente de confirmar con el cliente. */
export interface Tarifa {
  id: string;
  nom: string;
  import: string | null;
}
