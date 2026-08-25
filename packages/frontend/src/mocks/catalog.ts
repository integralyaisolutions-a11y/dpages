import type { ProducteApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

const CAT_ELABORAT_CUIT = { id: 1, nom: "ELABORAT CUIT" };
const CAT_PECES_NOBLES_KG = { id: 6, nom: "PECES NOBLES KG" };
const CAT_ELABORAT_FRESC = { id: 3, nom: "ELABORAT FRESC" };
const CAT_ELABORAT_FUMAT = { id: 4, nom: "ELABORAT FUMAT" };

let catalog: ProducteApi[] = [
  {
    id: 1,
    codi: "BOTNGTE",
    descripcio: "BOTIFARRA NEGRA",
    descripcioVenda: null,
    tipus: "simple",
    categoria: CAT_ELABORAT_CUIT,
    agrupacioProduccio: "BOTNG",
    format: "TALLAT",
    envasat: "ESPECIAL",
    pesKg: "1.200",
    preuVenda: "3.11",
    actiu: true,
  },
  {
    id: 2,
    codi: "BOTNGTN1",
    descripcio: "BOTIFARRA NEGRA",
    descripcioVenda: null,
    tipus: "simple",
    categoria: CAT_ELABORAT_CUIT,
    agrupacioProduccio: "BOTNG",
    format: "TALLAT",
    envasat: "NORMAL",
    pesKg: "1.000",
    preuVenda: "8.21",
    actiu: true,
  },
  {
    id: 3,
    codi: "BOTNGTN2",
    descripcio: "BOTIFARRA NEGRA",
    descripcioVenda: null,
    tipus: "simple",
    categoria: CAT_ELABORAT_CUIT,
    agrupacioProduccio: "BOTNG",
    format: "TALLAT",
    envasat: "NORMAL (web)",
    pesKg: "0.250",
    preuVenda: "29.70",
    actiu: true,
  },
  {
    id: 4,
    codi: "BOTNGTN4",
    descripcio: "BOTIFARRA NEGRA",
    descripcioVenda: null,
    tipus: "simple",
    categoria: CAT_ELABORAT_CUIT,
    agrupacioProduccio: "BOTNG",
    format: "TALLAT",
    envasat: "NORMAL",
    pesKg: "0.500",
    preuVenda: "47.34",
    actiu: true,
  },
  {
    id: 5,
    codi: "BOTPERTNP",
    descripcio: "BOTIFARRA PEROL",
    descripcioVenda: null,
    tipus: "simple",
    categoria: CAT_ELABORAT_CUIT,
    agrupacioProduccio: "BOTPE",
    format: "TALLAT",
    envasat: "NORMAL (pes)",
    // pesKg null = article "a mida" (mateix criteri que el contracte real, secció 4.2).
    pesKg: null,
    preuVenda: "47.64",
    actiu: true,
  },
  {
    id: 6,
    codi: "CTLLTATN",
    descripcio: "COSTELLETA",
    descripcioVenda: null,
    tipus: "simple",
    categoria: CAT_PECES_NOBLES_KG,
    agrupacioProduccio: "CTLL",
    format: "TALLAT",
    envasat: "NORMAL",
    pesKg: "0.500",
    // preuVenda: no confirmat en la data que em vau passar, valor de farciment.
    preuVenda: "12.50",
    actiu: true,
  },
  {
    id: 7,
    codi: "HAMTN2",
    descripcio: "HAMBURGUESA",
    descripcioVenda: null,
    tipus: "simple",
    categoria: CAT_ELABORAT_FRESC,
    agrupacioProduccio: "HAM",
    format: "TALLAT",
    envasat: "NORMAL",
    pesKg: "0.250",
    // preuVenda: no confirmat en la data que em vau passar, valor de farciment.
    preuVenda: "6.80",
    actiu: true,
  },
  {
    id: 8,
    codi: "BACLLW",
    descripcio: "BACÓ",
    descripcioVenda: null,
    tipus: "simple",
    categoria: CAT_ELABORAT_FUMAT,
    agrupacioProduccio: "BAC",
    format: "LLESCAT",
    envasat: "NORMAL (web)",
    // pesKg i preuVenda: no confirmats en la data que em vau passar, valors de farciment.
    pesKg: "0.300",
    preuVenda: "9.90",
    actiu: true,
  },
];

let nextProductId = catalog.length + 1;

export function getMockCatalog(): Promise<ProducteApi[]> {
  return mockRequest(catalog);
}

export function addMockProduct(product: Omit<ProducteApi, "id">): Promise<ProducteApi[]> {
  catalog = [...catalog, { id: nextProductId++, ...product }];
  return mockRequest(catalog);
}

export function updateMockProduct(codi: string, product: ProducteApi): Promise<ProducteApi[]> {
  catalog = catalog.map((item) => (item.codi === codi ? product : item));
  return mockRequest(catalog);
}
