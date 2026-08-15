/**
 * Formas crudas de las respuestas de la API REST v3 de WooCommerce
 * (/wp-json/wc/v3/ — ver ADR-001), limitadas a los campos que efectivamente
 * consumimos. No son el modelo de dominio: son el contrato con la API
 * externa, y sólo se transforman a Producte/Comanda vía las tablas de alias.
 */

export interface WooMetaData {
  id: number;
  key: string;
  value: unknown;
}

export interface WooLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  sku: string;
  quantity: number;
  price: number;
  meta_data: WooMetaData[];
}

export interface WooShippingLine {
  id: number;
  method_title: string;
  method_id: string;
  total: string;
}

export interface WooCouponLine {
  id: number;
  code: string;
  discount: string;
}

export interface WooOrder {
  id: number;
  status: string;
  currency: string;
  date_created_gmt: string;
  date_modified_gmt: string;
  customer_id: number;
  created_via: string;
  /** Con IVA. Los precios de línea (WooLineItem.price) llegan sin IVA. */
  total: string;
  line_items: WooLineItem[];
  shipping_lines: WooShippingLine[];
  coupon_lines: WooCouponLine[];
  meta_data: WooMetaData[];
}

export interface WooProductAttribute {
  id: number;
  name: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

export interface WooProductCategory {
  id: number;
  name: string;
  slug: string;
}

export interface WooProduct {
  id: number;
  name: string;
  sku: string;
  type: 'simple' | 'variable' | (string & {});
  status: string;
  /** No confiable como fuente de peso: prácticamente nunca informado, y con errores cuando lo está. */
  weight: string;
  date_modified_gmt: string;
  categories: WooProductCategory[];
  attributes: WooProductAttribute[];
  meta_data: WooMetaData[];
}

export interface WooProductVariationAttribute {
  id: number;
  name: string;
  option: string;
}

export interface WooProductVariation {
  id: number;
  sku: string;
  weight: string;
  date_modified_gmt: string;
  attributes: WooProductVariationAttribute[];
}
