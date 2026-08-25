import type { CategoriaApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

let categories: CategoriaApi[] = [
  { id: 1, nom: "ELABORAT CUIT", elaboratPorc: false, agrupacioRendiment: null },
  { id: 2, nom: "ELABORAT CURAT", elaboratPorc: false, agrupacioRendiment: null },
  { id: 3, nom: "ELABORAT FRESC", elaboratPorc: true, agrupacioRendiment: "MAGRE" },
  { id: 4, nom: "ELABORAT FUMAT", elaboratPorc: false, agrupacioRendiment: null },
  { id: 5, nom: "PECES MAGRES", elaboratPorc: true, agrupacioRendiment: "MAGRE" },
  { id: 6, nom: "PECES NOBLES KG", elaboratPorc: true, agrupacioRendiment: "KG" },
  { id: 7, nom: "PECES NOBLES PAQ", elaboratPorc: true, agrupacioRendiment: "PAQ" },
  { id: 8, nom: "VÍSCERES", elaboratPorc: false, agrupacioRendiment: null },
];

let nextCategoryId = categories.length + 1;

export function getMockCategories(): Promise<CategoriaApi[]> {
  return mockRequest(categories);
}

export function addMockCategory(category: Omit<CategoriaApi, "id">): Promise<CategoriaApi[]> {
  categories = [...categories, { id: nextCategoryId++, ...category }];
  return mockRequest(categories);
}

export function updateMockCategory(id: number, category: CategoriaApi): Promise<CategoriaApi[]> {
  categories = categories.map((item) => (item.id === id ? category : item));
  return mockRequest(categories);
}

export function removeMockCategory(id: number): Promise<CategoriaApi[]> {
  categories = categories.filter((item) => item.id !== id);
  return mockRequest(categories);
}
