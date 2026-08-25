import type { FilaMatriuTarifesApi, TarifaResumApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

let tariffColumns: TarifaResumApi[] = [
  { id: 1, codi: "BOTIFARRA", nom: "BOTIFARRA" },
  { id: 2, codi: "CATALUNYA", nom: "CATALUNYA" },
  { id: 3, codi: "CCAA", nom: "CCAA" },
  { id: 4, codi: "USA", nom: "Estados Unidos" },
  { id: 5, codi: "EXPORTACIO", nom: "Exportacio" },
  { id: 6, codi: "SARGAIRE", nom: "SARGAIRE" },
  { id: 7, codi: "WEB+PART", nom: "WEB+PART" },
];

let nextTariffId = tariffColumns.length + 1;

/**
 * `producteId` 101+ (a propòsit fora del rang 1-8 del mock de catàleg,
 * `mocks/catalog.ts`): aquesta llista de tarifes és una altra mostra de dades
 * que no comparteix SKU amb el mock del catàleg (gap ja documentat a
 * AUDITORIA_FRONTEND.md §4 — dues fonts de veritat separades). No inventem
 * un encreuament fals assignant-los un id que sí existeixi al catàleg.
 */
let productRates: FilaMatriuTarifesApi[] = [
  {
    producteId: 101,
    codi: "BOTTN6",
    descripcio: "BOTIFARRA",
    preus: { "1": "10.45", "2": "4.43", "3": "5.01", "4": null, "5": null, "6": null, "7": null },
  },
  {
    producteId: 102,
    codi: "COLLTN",
    descripcio: "COLL",
    preus: { "1": null, "2": "36.33", "3": "35.88", "4": null, "5": "37.97", "6": null, "7": null },
  },
  {
    producteId: 103,
    codi: "DONBLTNW",
    descripcio: "DONEGAL BLANC",
    preus: { "1": null, "2": "16.01", "3": "16.83", "4": null, "5": "16.44", "6": null, "7": null },
  },
  {
    producteId: 104,
    codi: "GARRTE",
    descripcio: "GARRONS",
    preus: { "1": null, "2": "7.40", "3": "7.13", "4": null, "5": null, "6": null, "7": null },
  },
  {
    producteId: 105,
    codi: "CTLLTATN",
    descripcio: "COSTELLETA",
    preus: { "1": null, "2": null, "3": "7.29", "4": null, "5": null, "6": null, "7": null },
  },
  {
    producteId: 106,
    codi: "HAMTN2",
    descripcio: "HAMBURGUESA",
    preus: { "1": null, "2": null, "3": "7.75", "4": null, "5": null, "6": null, "7": null },
  },
  {
    producteId: 107,
    codi: "PICTN250",
    descripcio: "PICADA 250",
    preus: { "1": null, "2": "34.00", "3": "22.00", "4": null, "5": "30.12", "6": null, "7": null },
  },
];

export function getMockTariffColumns(): Promise<TarifaResumApi[]> {
  return mockRequest(tariffColumns);
}

export function getMockRates(): Promise<FilaMatriuTarifesApi[]> {
  return mockRequest(productRates);
}

export function addMockTariff(
  tariff: Omit<TarifaResumApi, "id">,
): Promise<{ tariffColumns: TarifaResumApi[]; data: FilaMatriuTarifesApi[] }> {
  const created = { id: nextTariffId++, ...tariff };
  tariffColumns = [...tariffColumns, created];
  productRates = productRates.map((product) => ({
    ...product,
    preus: { ...product.preus, [String(created.id)]: null },
  }));
  return mockRequest({ tariffColumns, data: productRates });
}

export function updateMockPrices(producteId: number, preus: Record<string, string | null>): Promise<FilaMatriuTarifesApi[]> {
  productRates = productRates.map((product) =>
    product.producteId === producteId ? { ...product, preus: { ...product.preus, ...preus } } : product,
  );
  return mockRequest(productRates);
}
