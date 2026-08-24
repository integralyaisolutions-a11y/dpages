import type { OrderLineApi, ProductApi } from "./api";

export type OrderedWeightResult = {
  value: number;
  isCalculated: boolean;
};

// Criterio: un producto "sin peso definido" es weightKg <= 0 (incluye el
// caso "a medida" del prototipo, donde el peso de ficha arranca en 0).
// En ese caso el pes demanat no se puede calcular y queda a cargo del usuario.
export function calculateOrderedWeightKg(
  orderedUnits: number,
  product: ProductApi | undefined,
): OrderedWeightResult {
  if (!product || product.weightKg <= 0) {
    return { value: 0, isCalculated: false };
  }
  return { value: Number((orderedUnits * product.weightKg).toFixed(3)), isCalculated: true };
}

export function formatDateDisplay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function sumOrderedWeightKg(lines: OrderLineApi[]): number {
  return Number(lines.reduce((sum, line) => sum + line.orderedWeightKg, 0).toFixed(3));
}

export function aggregateProductionDates(lines: OrderLineApi[]): string {
  const uniqueDates = Array.from(
    new Set(lines.map((line) => line.productionDate).filter((date): date is string => Boolean(date))),
  );
  return uniqueDates.map(formatDateDisplay).join(", ");
}
