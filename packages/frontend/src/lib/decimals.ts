/**
 * Conversión string↔number para los campos que el backend manda como string
 * (docs/contrato-api.md §2: pesos con 3 decimales, importes con 2 — nunca
 * `number`, para no perder precisión al sumar). `decimals` es explícito,
 * no inferido, porque dos campos con el mismo tipo de dato (string
 * decimal) pueden tener escalas de negocio distintas (kg vs. €).
 */

/** Para MOSTRAR: string del backend → texto local con coma decimal (sin símbolo de unidad/moneda, eso lo agrega el call site). `null` (ej. pesKg de un article "a mida") → "—". */
export function formatDecimal(value: string | null, decimals: number): string {
  if (value === null) return "—";
  return Number(value).toFixed(decimals).replace(".", ",");
}

/** Para ENVIAR: number/string de un formulario (coma o punto decimal) → string con la precisión exacta que espera el backend. Nunca produce NaN: un valor no numérico cae a 0. */
export function parseDecimalInput(value: number | string, decimals: number): string {
  const parsed = typeof value === "number" ? value : Number(value.trim().replace(",", "."));
  return (Number.isNaN(parsed) ? 0 : parsed).toFixed(decimals);
}
