import type { PigYieldApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

let pigYields: PigYieldApi[] = [
  { id: "py-1", category: "PECES MAGRES", productionGroup: "ESPATLLES AMB OS", unitsPerPig: 2, kgPerUnit: 3.5 },
  { id: "py-2", category: "PECES NOBLES KG", productionGroup: "COSTELLA", unitsPerPig: 2, kgPerUnit: 12 },
  { id: "py-3", category: "PECES NOBLES KG", productionGroup: "GALTES", unitsPerPig: 2, kgPerUnit: 0.35 },
  { id: "py-4", category: "PECES NOBLES KG", productionGroup: "LLOM SENCER", unitsPerPig: 2, kgPerUnit: 2.5 },
  { id: "py-5", category: "PECES NOBLES KG", productionGroup: "ORELLA", unitsPerPig: 2, kgPerUnit: 0.35 },
  { id: "py-6", category: "PECES NOBLES KG", productionGroup: "SECRETS", unitsPerPig: 2, kgPerUnit: 0.4 },
  { id: "py-7", category: "PECES NOBLES PAQ", productionGroup: "PEUS", unitsPerPig: 4, kgPerUnit: 0 },
];

export function getMockPigYields(): Promise<PigYieldApi[]> {
  return mockRequest(pigYields);
}

export function addMockPigYield(pigYield: PigYieldApi): Promise<PigYieldApi[]> {
  pigYields = [...pigYields, pigYield];
  return mockRequest(pigYields);
}

export function updateMockPigYield(id: string, pigYield: PigYieldApi): Promise<PigYieldApi[]> {
  pigYields = pigYields.map((item) => (item.id === id ? pigYield : item));
  return mockRequest(pigYields);
}

export function deleteMockPigYield(id: string): Promise<PigYieldApi[]> {
  pigYields = pigYields.filter((item) => item.id !== id);
  return mockRequest(pigYields);
}
