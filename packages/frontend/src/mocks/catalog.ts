import type { ProductApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

let catalog: ProductApi[] = [
  {
    code: "BOTNGTE",
    category: "ELABORAT CUIT",
    productionGroup: "BOTNG",
    description: "BOTIFARRA NEGRA",
    format: "TALLAT",
    packaging: "ESPECIAL",
    weightKg: 1.2,
    basePrice: 3.11,
    status: "Actiu",
  },
  {
    code: "BOTNGTN1",
    category: "ELABORAT CUIT",
    productionGroup: "BOTNG",
    description: "BOTIFARRA NEGRA",
    format: "TALLAT",
    packaging: "NORMAL",
    weightKg: 1.0,
    basePrice: 8.21,
    status: "Actiu",
  },
  {
    code: "BOTNGTN2",
    category: "ELABORAT CUIT",
    productionGroup: "BOTNG",
    description: "BOTIFARRA NEGRA",
    format: "TALLAT",
    packaging: "NORMAL (web)",
    weightKg: 0.25,
    basePrice: 29.7,
    status: "Actiu",
  },
  {
    code: "BOTNGTN4",
    category: "ELABORAT CUIT",
    productionGroup: "BOTNG",
    description: "BOTIFARRA NEGRA",
    format: "TALLAT",
    packaging: "NORMAL",
    weightKg: 0.5,
    basePrice: 47.34,
    status: "Actiu",
  },
  {
    code: "BOTPERTNP",
    category: "ELABORAT CUIT",
    productionGroup: "BOTPE",
    description: "BOTIFARRA PEROL",
    format: "TALLAT",
    packaging: "NORMAL (pes)",
    weightKg: 0,
    basePrice: 47.64,
    status: "Actiu",
  },
  {
    code: "CTLLTATN",
    category: "PECES NOBLES KG",
    productionGroup: "CTLL",
    description: "COSTELLETA",
    format: "TALLAT",
    packaging: "NORMAL",
    weightKg: 0.5,
    // basePrice: no confirmado en la data que me pasaste, valor de relleno.
    basePrice: 12.5,
    status: "Actiu",
  },
  {
    code: "HAMTN2",
    category: "ELABORAT FRESC",
    productionGroup: "HAM",
    description: "HAMBURGUESA",
    format: "TALLAT",
    packaging: "NORMAL",
    weightKg: 0.25,
    // basePrice: no confirmado en la data que me pasaste, valor de relleno.
    basePrice: 6.8,
    status: "Actiu",
  },
  {
    code: "BACLLW",
    category: "ELABORAT FUMAT",
    productionGroup: "BAC",
    description: "BACÓ",
    format: "LLESCAT",
    packaging: "NORMAL (web)",
    // weightKg y basePrice: no confirmados en la data que me pasaste, valores de relleno.
    weightKg: 0.3,
    basePrice: 9.9,
    status: "Actiu",
  },
];

export function getMockCatalog(): Promise<ProductApi[]> {
  return mockRequest(catalog);
}

export function addMockProduct(product: ProductApi): Promise<ProductApi[]> {
  catalog = [...catalog, product];
  return mockRequest(catalog);
}

export function updateMockProduct(code: string, product: ProductApi): Promise<ProductApi[]> {
  catalog = catalog.map((item) => (item.code === code ? product : item));
  return mockRequest(catalog);
}
