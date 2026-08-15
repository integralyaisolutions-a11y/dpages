/**
 * Un artículo real del catálogo de dPagès (~111 artículos). Es la entidad
 * canónica: NO corresponde 1:1 a un producto de WooCommerce, porque cada
 * artículo existe duplicado en WooCommerce por idioma (ver AliasProducte y
 * ADR-008).
 */
export interface Producte {
  id: string;
  /** 14 artículos publicados no tienen código en WooCommerce. */
  codi: string | null;
  nom: string;
  categoria: string | null;
  /** NUMERIC(10,3) como string, en kg. Viene de la carga del cliente, nunca de WooCommerce. */
  pesKg: string | null;
  actiu: boolean;
}

/**
 * Vínculo entre un producto de WooCommerce (una de las dos versiones por
 * idioma) y el artículo canónico. Reemplaza al mapeo directo
 * woo_product_id → artículo, imposible porque el mismo código aparece en dos
 * product_id distintos y ambos reciben pedidos.
 */
export interface AliasProducte {
  id: string;
  producteId: string;
  wooProductId: number;
  idioma: 'ca' | 'es';
  /** El SKU tal como viene en esa fila de WooCommerce; puede diferir de producte.codi si hay inconsistencia. */
  codi: string | null;
}

export interface CategoriaProducte {
  id: string;
  nom: string;
}
