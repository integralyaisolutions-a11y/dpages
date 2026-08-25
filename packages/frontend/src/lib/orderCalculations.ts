import type { ComandaLiniaApi, ProducteApi } from "./api";
import { formatData } from "./dates";

export type OrderedWeightResult = {
  value: number;
  isCalculated: boolean;
};

// Criterio: un producto "sin peso definido" es pesKg === null (artículo "a
// medida", ver contrato §4.2). En ese caso el pes demanat no se puede
// calcular y queda a cargo del usuario.
export function calculateOrderedWeightKg(orderedUnits: number, product: ProducteApi | undefined): OrderedWeightResult {
  if (!product || product.pesKg === null) {
    return { value: 0, isCalculated: false };
  }
  return { value: Number((orderedUnits * Number(product.pesKg)).toFixed(3)), isCalculated: true };
}

export function sumOrderedWeightKg(lines: ComandaLiniaApi[]): number {
  return Number(lines.reduce((sum, line) => sum + Number(line.kgDemanats), 0).toFixed(3));
}

// dataProduccio: fecha de referencia (qué día se produce), no un instante
// puntual — sin hora. Ver criterio completo en lib/dates.ts y el listado de
// pantallas documentado en el informe de esta sesión.
export function aggregateProductionDates(lines: ComandaLiniaApi[]): string {
  const uniqueDates = Array.from(
    new Set(lines.map((line) => line.dataProduccio).filter((date): date is string => Boolean(date))),
  );
  return uniqueDates.map((date) => formatData(date, false)).join(", ");
}
