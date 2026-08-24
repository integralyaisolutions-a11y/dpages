import type { CategoryApi, OrderApi, PigYieldApi, ProductApi } from "./api";
import { calculateOrderedWeightKg } from "./orderCalculations";
import { calculatePigYieldTotal } from "./pigYieldCalculations";

export type ProductionMode = "MAGRE" | "KG" | "PAQ" | null;

export type ProductionRow = {
  id: string;
  mode: ProductionMode;
  agrupacioRendiment: string;
  agrupacioProduccio: string;
  paqComanda: number | null;
  kgAElaborar: number | null;
  rendiment: number | null;
  diferencia: number | null;
};

// Cruce pendiente de regla de negocio confirmada con el client (mismo caso
// ja deixat pendent a Rendiments Porcs): no hi ha un identificador compartit
// entre l'Agrupació Producció de mocks/pigYields.ts (ex. "COSTELLA") i els
// codis de mocks/catalog.ts (ex. CTLLTATN). Mentre no es defineixi, es creua
// per coincidència de text entre el nom del tall i la descripció del
// producte — un prefix compartit d'almenys 6 caràcters (ex. "COSTELL" a
// "COSTELLA"/"COSTELLETA": un substring simple no serveix perquè el
// diminutiu català insereix "-ETA" abans de la vocal final, no l'afegeix
// al final). On no hi ha coincidència raonable, es mostra "—" en lloc
// d'inventar-la.
const MIN_SHARED_PREFIX = 6;

function sharedPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let shared = 0;
  while (shared < max && a[shared] === b[shared]) shared++;
  return shared;
}

export function findMatchingProduct(productionGroup: string, catalog: ProductApi[]): ProductApi | undefined {
  const needle = productionGroup.trim().toUpperCase();
  return catalog.find((product) => {
    const description = product.description.trim().toUpperCase();
    return sharedPrefixLength(needle, description) >= MIN_SHARED_PREFIX;
  });
}

function withinRange(date: string | null, dateFrom: string, dateTo: string): boolean {
  if (dateFrom && (!date || date < dateFrom)) return false;
  if (dateTo && (!date || date > dateTo)) return false;
  return true;
}

export function aggregateProductDemand(
  productCode: string,
  orders: OrderApi[],
  products: ProductApi[],
  dateFrom: string,
  dateTo: string,
): { units: number; weightKg: number } {
  const product = products.find((item) => item.code === productCode);
  let units = 0;
  let weightKg = 0;
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.productCode !== productCode || !withinRange(line.productionDate, dateFrom, dateTo)) continue;
      const orderedWeight = calculateOrderedWeightKg(line.orderedUnits, product);
      units += line.orderedUnits;
      weightKg += orderedWeight.isCalculated ? orderedWeight.value : line.orderedWeightKg;
    }
  }
  return { units, weightKg: Number(weightKg.toFixed(3)) };
}

// Les files MAGRE no representen un tall concret (per definició no estan
// vinculades a un producte de mocks/catalog.ts), sinó la demanda agregada de
// tots els productes elaborats la categoria dels quals comparteix la mateixa
// Agrupació Rendiment "MAGRE" a categories.ts. A diferència del cas KG/PAQ,
// aquest encreuament sí és un camp real (agrupacioRendiment), no una
// heurística de text.
export function aggregateElaboratedDemand(
  categories: CategoryApi[],
  orders: OrderApi[],
  products: ProductApi[],
  dateFrom: string,
  dateTo: string,
): number {
  const elaboratedCodes = new Set(
    products
      .filter((product) => categories.find((category) => category.name === product.category)?.agrupacioRendiment === "MAGRE")
      .map((product) => product.code),
  );
  let weightKg = 0;
  for (const order of orders) {
    for (const line of order.lines) {
      if (!elaboratedCodes.has(line.productCode) || !withinRange(line.productionDate, dateFrom, dateTo)) continue;
      const product = products.find((item) => item.code === line.productCode);
      const orderedWeight = calculateOrderedWeightKg(line.orderedUnits, product);
      weightKg += orderedWeight.isCalculated ? orderedWeight.value : line.orderedWeightKg;
    }
  }
  return Number(weightKg.toFixed(3));
}

export function buildProductionRow(
  pigYield: PigYieldApi,
  mode: ProductionMode,
  pigsToProduce: number,
  matchedProduct: ProductApi | undefined,
  orders: OrderApi[],
  products: ProductApi[],
  categories: CategoryApi[],
  dateFrom: string,
  dateTo: string,
): ProductionRow {
  const base = {
    id: pigYield.id,
    mode,
    agrupacioRendiment: mode ?? "—",
    agrupacioProduccio: pigYield.productionGroup,
  };

  if (mode === "KG") {
    const pesTotal = calculatePigYieldTotal(pigYield.unitsPerPig, pigYield.kgPerUnit);
    const rendiment = Number((pesTotal * pigsToProduce).toFixed(3));
    if (!matchedProduct) {
      return { ...base, paqComanda: null, kgAElaborar: null, rendiment, diferencia: null };
    }
    const demand = aggregateProductDemand(matchedProduct.code, orders, products, dateFrom, dateTo);
    const diferencia = Number((rendiment - demand.weightKg).toFixed(3));
    return { ...base, paqComanda: demand.units, kgAElaborar: demand.weightKg, rendiment, diferencia };
  }

  if (mode === "PAQ") {
    const rendiment = Number((pigYield.unitsPerPig * pigsToProduce).toFixed(2));
    if (!matchedProduct) {
      return { ...base, paqComanda: null, kgAElaborar: null, rendiment, diferencia: null };
    }
    const demand = aggregateProductDemand(matchedProduct.code, orders, products, dateFrom, dateTo);
    const diferencia = Number((rendiment - demand.units).toFixed(2));
    return { ...base, paqComanda: demand.units, kgAElaborar: null, rendiment, diferencia };
  }

  const kgAElaborar = aggregateElaboratedDemand(categories, orders, products, dateFrom, dateTo);
  return { ...base, paqComanda: null, kgAElaborar, rendiment: null, diferencia: null };
}
