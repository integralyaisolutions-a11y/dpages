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
  /** NUMERIC(10,3) como string, en kg. Viene de la carga del cliente, nunca de WooCommerce. */
  pesKg: string | null;
  actiu: boolean;
  /**
   * Ya NO se sincroniza desde WooCommerce (confirmado con el cliente el
   * 18/08/2026): la categoría es autoridad del propio sistema, relacionada
   * por SKU — WooCommerce dejó de ser la fuente de verdad del catálogo
   * también en este punto, no sólo en pedidos. Null = todavía sin
   * categoría resuelta (poco común).
   */
  categoriaId: string | null;
  /**
   * Texto libre: agrupa varios códigos bajo una misma familia lógica de
   * producción (por ejemplo, variantes de un mismo corte que se elaboran
   * juntas). Null si el artículo no pertenece a ninguna agrupación.
   */
  agrupacioProduccio: string | null;
  format: 'SENCER' | 'TALLAT' | 'LLESCAT' | null;
  envasat: 'NORMAL' | 'NORMAL (pes)' | 'NORMAL (web)' | 'ESPECIAL' | null;
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

/**
 * Categoría real del catálogo. También duplicada por idioma en WooCommerce
 * (Fresc/Fresco, Conserves/Conservas...) — igual que los artículos, una fila
 * acá por categoría real, resuelta por nombre canónico en la transformación
 * (heurística provisoria, ver `resolverNomCategoriaCanonic` en el backend).
 */
export interface CategoriaProducte {
  id: string;
  nom: string;
  elaboratPorc: boolean;
  /**
   * Regla de negocio, no ausencia de dato: `null` sólo cuando
   * `elaboratPorc` es `false` — una categoría que no es elaborado de cerdo
   * no participa del cálculo de rendimiento. Cuando `elaboratPorc` es
   * `true`, siempre trae uno de los tres valores.
   */
  agrupacioRendiment: 'KG' | 'MAGRE' | 'PAQ' | null;
}
