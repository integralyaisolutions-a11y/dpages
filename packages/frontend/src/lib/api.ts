// Cliente HTTP base para hablar con el backend real de dPagès.
//
// Regla de tipos del proyecto: TODO tipo de dato que viaja entre frontend
// y backend se define acá, con el sufijo `Api` (ej. `ComandaApi`,
// `ProducteApi`, `ClientApi`, `TarifaApi`). Ningún otro archivo del
// frontend debe declarar sus propios tipos de dominio sueltos
// (nada de catalog.ts, comanda.ts, client.ts fuera de este archivo):
// eso duplicaría el contrato y lo desincroniza del backend.
//
// Los componentes de UI nunca deben llamar fetch() directamente contra
// el backend: pasan siempre por un hook de /hooks, que a su vez usa las
// funciones de este archivo.
//
// TODO: definir baseUrl (env var), manejo de auth (token Firebase),
// manejo de errores y los tipos *Api reales cuando cierre el contrato
// con el backend.

export type CategoryApi = {
  id: string;
  name: string;
  elaboratPorc: boolean;
  agrupacioRendiment: string | null;
};

export type ProductApi = {
  code: string;
  category: string;
  productionGroup: string;
  description: string;
  format: string;
  packaging: string;
  weightKg: number;
  basePrice: number;
  status: "Actiu" | "Inactiu";
};

export type TariffApi = {
  code: string;
  name: string;
};

export type ProductRateApi = {
  productCode: string;
  category: string;
  format: string;
  description: string;
  prices: Record<string, number | null>;
};

export type ClientTariffApi = {
  code: string;
  name: string;
  city: string;
  tariffCode: string | null;
};

export type CarrierApi = {
  code: string;
  name: string;
};

export type OrderLineApi = {
  id: string;
  productCode: string;
  productionDate: string | null;
  orderedUnits: number;
  deliveredUnits: number;
  // Solo se usa (y es editable) cuando el producte no tiene weightKg definido
  // en el catàleg; si lo tiene, el pes demanat se recalcula en vivo y este
  // valor se sobreescribe con el resultado del cálculo al guardar.
  orderedWeightKg: number;
  deliveredWeightKg: number;
  productionNotes: string;
};

export type PigYieldApi = {
  id: string;
  category: string;
  productionGroup: string;
  unitsPerPig: number;
  kgPerUnit: number;
};

export type OrderApi = {
  number: string;
  status: "Oberta" | "Incidència";
  clientCode: string;
  poblacioDesti: string;
  tariffCode: string | null;
  carrierCode: string | null;
  orderDate: string;
  deliveryDate: string | null;
  shippingDate: string | null;
  packageCount: number;
  deliveryAddress: string;
  productionNotes: string;
  deliveryNotes: string;
  lines: OrderLineApi[];
};
