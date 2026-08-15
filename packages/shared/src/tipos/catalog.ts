/**
 * Un artículo real del catálogo de dPagès (~111 artículos). Es la entidad
 * canónica: NO corresponde 1:1 a un producto de WooCommerce, porque cada
 * artículo existe duplicado en WooCommerce por idioma (ver AliasProducte y
 * ADR-008).
 *
 * Sin campo de categoría/agrupación a propósito: el cliente todavía no
 * definió cómo se clasifican los artículos en las pantallas — ver
 * "Pendientes de definición" en docs/contexto-negocio.md. Se agrega con una
 * migración aparte cuando se cierre esa decisión, no se anticipa acá.
 */
export interface Producte {
  id: string;
  /** 14 artículos publicados no tienen código en WooCommerce. */
  codi: string | null;
  nom: string;
  /** NUMERIC(10,3) como string, en kg. Viene de la carga del cliente, nunca de WooCommerce. */
  pesKg: string | null;
  actiu: boolean;
}

/**
 * Vínculo entre una fila de WooCommerce (un idioma, y opcionalmente una
 * variación concreta) y el artículo canónico. Reemplaza al mapeo directo
 * woo_product_id → artículo, imposible porque el mismo código aparece en dos
 * product_id distintos (uno por idioma) y ambos reciben pedidos — y porque
 * las variaciones tienen, además, su propio id dentro de cada product_id.
 */
export interface AliasProducte {
  id: string;
  producteId: string;
  wooProductId: number;
  /** 0 = el producto (simple o padre variable) en sí, no una variación. */
  wooVariationId: number;
  idioma: 'ca' | 'es';
  /** El SKU tal como viene en esa fila/variación de WooCommerce; puede diferir de producte.codi si hay inconsistencia. */
  codi: string | null;
}
