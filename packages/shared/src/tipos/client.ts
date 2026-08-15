export interface Client {
  id: string;
  /** null si esConvidat. */
  wooCustomerId: number | null;
  esConvidat: boolean;
  /** Cobertura ~57% en los pedidos históricos; puede venir de dos campos de WooCommerce que a veces discrepan. */
  nif: string | null;
}

export interface Transportista {
  id: string;
  nom: string;
}

/** Definición final (importe fijo, por franja, etc.) pendiente de confirmar con el cliente. */
export interface Tarifa {
  id: string;
  nom: string;
  import: string | null;
}
