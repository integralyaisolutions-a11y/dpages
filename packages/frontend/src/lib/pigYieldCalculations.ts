export function calculatePigYieldTotal(unitsPerPig: number, kgPerUnit: number): number {
  return Number((unitsPerPig * kgPerUnit).toFixed(3));
}
