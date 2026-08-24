import type { ProductRateApi, TariffApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

let tariffColumns: TariffApi[] = [
  { code: "BOTIFARRA", name: "BOTIFARRA" },
  { code: "CATALUNYA", name: "CATALUNYA" },
  { code: "CCAA", name: "CCAA" },
  { code: "USA", name: "Estados Unidos" },
  { code: "EXPORTACIO", name: "Exportacio" },
  { code: "SARGAIRE", name: "SARGAIRE" },
  { code: "WEB+PART", name: "WEB+PART" },
];

let productRates: ProductRateApi[] = [
  {
    productCode: "BOTTN6",
    category: "ELABORAT FRESC",
    format: "boti X 2UT",
    description: "BOTIFARRA",
    prices: {
      BOTIFARRA: 10.45,
      CATALUNYA: 4.43,
      CCAA: 5.01,
      USA: null,
      EXPORTACIO: null,
      SARGAIRE: null,
      "WEB+PART": null,
    },
  },
  {
    productCode: "COLLTN",
    category: "ELABORAT FRESC",
    format: "boti X 2UT",
    description: "COLL",
    prices: {
      BOTIFARRA: null,
      CATALUNYA: 36.33,
      CCAA: 35.88,
      USA: null,
      EXPORTACIO: 37.97,
      SARGAIRE: null,
      "WEB+PART": null,
    },
  },
  {
    productCode: "DONBLTNW",
    category: "ELABORAT FRESC",
    format: "boti X 2UT",
    description: "DONEGAL BLANC",
    prices: {
      BOTIFARRA: null,
      CATALUNYA: 16.01,
      CCAA: 16.83,
      USA: null,
      EXPORTACIO: 16.44,
      SARGAIRE: null,
      "WEB+PART": null,
    },
  },
  {
    productCode: "GARRTE",
    category: "ELABORAT FRESC",
    format: "boti X 2UT",
    description: "GARRONS",
    prices: {
      BOTIFARRA: null,
      CATALUNYA: 7.4,
      CCAA: 7.13,
      USA: null,
      EXPORTACIO: null,
      SARGAIRE: null,
      "WEB+PART": null,
    },
  },
  {
    productCode: "CTLLTATN",
    category: "PECES NOBLES KG",
    format: "TALLAT",
    description: "COSTELLETA",
    prices: {
      BOTIFARRA: null,
      CATALUNYA: null,
      CCAA: 7.29,
      USA: null,
      EXPORTACIO: null,
      SARGAIRE: null,
      "WEB+PART": null,
    },
  },
  {
    productCode: "HAMTN2",
    category: "ELABORAT FRESC",
    format: "TALLAT",
    description: "HAMBURGUESA",
    prices: {
      BOTIFARRA: null,
      CATALUNYA: null,
      CCAA: 7.75,
      USA: null,
      EXPORTACIO: null,
      SARGAIRE: null,
      "WEB+PART": null,
    },
  },
  {
    productCode: "PICTN250",
    category: "ELABORAT FRESC",
    format: "boti X 2UT",
    description: "PICADA 250",
    prices: {
      BOTIFARRA: null,
      CATALUNYA: 34.0,
      CCAA: 22.0,
      USA: null,
      EXPORTACIO: 30.12,
      SARGAIRE: null,
      "WEB+PART": null,
    },
  },
];

export function getMockTariffColumns(): Promise<TariffApi[]> {
  return mockRequest(tariffColumns);
}

export function getMockRates(): Promise<ProductRateApi[]> {
  return mockRequest(productRates);
}

export function addMockTariff(tariff: TariffApi): Promise<{ tariffColumns: TariffApi[]; data: ProductRateApi[] }> {
  tariffColumns = [...tariffColumns, tariff];
  productRates = productRates.map((product) => ({
    ...product,
    prices: { ...product.prices, [tariff.code]: null },
  }));
  return mockRequest({ tariffColumns, data: productRates });
}

export function updateMockPrices(
  productCode: string,
  prices: Record<string, number | null>,
): Promise<ProductRateApi[]> {
  productRates = productRates.map((product) =>
    product.productCode === productCode ? { ...product, prices: { ...product.prices, ...prices } } : product,
  );
  return mockRequest(productRates);
}
