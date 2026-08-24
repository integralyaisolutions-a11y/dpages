import type { CategoryApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

let categories: CategoryApi[] = [
  { id: "elaborat-cuit", name: "ELABORAT CUIT", elaboratPorc: false, agrupacioRendiment: null },
  { id: "elaborat-curat", name: "ELABORAT CURAT", elaboratPorc: false, agrupacioRendiment: null },
  { id: "elaborat-fresc", name: "ELABORAT FRESC", elaboratPorc: true, agrupacioRendiment: "MAGRE" },
  { id: "elaborat-fumat", name: "ELABORAT FUMAT", elaboratPorc: false, agrupacioRendiment: null },
  { id: "peces-magres", name: "PECES MAGRES", elaboratPorc: true, agrupacioRendiment: "MAGRE" },
  { id: "peces-nobles-kg", name: "PECES NOBLES KG", elaboratPorc: true, agrupacioRendiment: "KG" },
  { id: "peces-nobles-paq", name: "PECES NOBLES PAQ", elaboratPorc: true, agrupacioRendiment: "PAQ" },
  { id: "visceres", name: "VÍSCERES", elaboratPorc: false, agrupacioRendiment: null },
];

export function getMockCategories(): Promise<CategoryApi[]> {
  return mockRequest(categories);
}

export function addMockCategory(category: CategoryApi): Promise<CategoryApi[]> {
  categories = [...categories, category];
  return mockRequest(categories);
}

export function updateMockCategory(id: string, category: CategoryApi): Promise<CategoryApi[]> {
  categories = categories.map((item) => (item.id === id ? category : item));
  return mockRequest(categories);
}

export function removeMockCategory(id: string): Promise<CategoryApi[]> {
  categories = categories.filter((item) => item.id !== id);
  return mockRequest(categories);
}
