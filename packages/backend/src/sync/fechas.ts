/**
 * WooCommerce entrega `date_modified_gmt` como cadena ISO SIN sufijo de
 * zona (ej. "2026-05-12T09:02:00") — ya está en UTC, por eso el "_gmt" en
 * el nombre. El problema es que Node interpreta una cadena así como hora
 * LOCAL si no se le fuerza la zona explícitamente: es exactamente la causa
 * de pérdida de registros que hay que evitar acá. Por eso TODO el parseo de
 * fechas de WooCommerce en la capa de sync pasa por esta función, nunca por
 * `new Date(cadena)` directo.
 */
export function parsearFechaGmt(gmt: string): Date {
  const conZona = gmt.endsWith('Z') ? gmt : `${gmt}Z`;
  const fecha = new Date(conZona);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`Fecha GMT de WooCommerce inválida: "${gmt}"`);
  }
  return fecha;
}

/** Mismo formato que WooCommerce usa en date_modified_gmt: sin milisegundos ni "Z". */
export function formatearFechaGmt(fecha: Date): string {
  return fecha.toISOString().replace(/\.\d{3}Z$/, '');
}
