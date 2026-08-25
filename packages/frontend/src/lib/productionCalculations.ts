import type { CategoriaApi, ComandaDetallApi, ProducteApi, RendimentPorcApi } from "./api";
import { calculatePigYieldTotal } from "./pigYieldCalculations";

export type ProductionMode = "MAGRE" | "KG" | "PAQ" | null;

export type ProductionRow = {
  id: number;
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

export function findMatchingProduct(productionGroup: string, catalog: ProducteApi[]): ProducteApi | undefined {
  const needle = productionGroup.trim().toUpperCase();
  return catalog.find((product) => {
    const description = product.descripcio.trim().toUpperCase();
    return sharedPrefixLength(needle, description) >= MIN_SHARED_PREFIX;
  });
}

function withinRange(date: string | null, dateFrom: string, dateTo: string): boolean {
  const day = date?.slice(0, 10) ?? null;
  if (dateFrom && (!day || day < dateFrom)) return false;
  if (dateTo && (!day || day > dateTo)) return false;
  return true;
}

export function aggregateProductDemand(
  producteId: number,
  orders: ComandaDetallApi[],
  dateFrom: string,
  dateTo: string,
): { units: number; weightKg: number } {
  let units = 0;
  let weightKg = 0;
  for (const order of orders) {
    for (const line of order.linies) {
      if (line.esborrat || line.producte?.id !== producteId || !withinRange(line.dataProduccio, dateFrom, dateTo)) {
        continue;
      }
      units += line.unitatsDemanades;
      weightKg += Number(line.kgDemanats);
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
  categories: CategoriaApi[],
  orders: ComandaDetallApi[],
  dateFrom: string,
  dateTo: string,
): number {
  const elaboratedCategoryNames = new Set(
    categories.filter((category) => category.agrupacioRendiment === "MAGRE").map((category) => category.nom),
  );
  let weightKg = 0;
  for (const order of orders) {
    for (const line of order.linies) {
      if (line.esborrat || !withinRange(line.dataProduccio, dateFrom, dateTo)) continue;
      // La línia ya trae el nombre de su categoria embebido (capa 20,
      // ComandaLiniaApi.categoria) — no hace falta cruzar contra el catàleg.
      if (!line.categoria || !elaboratedCategoryNames.has(line.categoria)) continue;
      weightKg += Number(line.kgDemanats);
    }
  }
  return Number(weightKg.toFixed(3));
}

export function buildProductionRow(
  pigYield: RendimentPorcApi,
  mode: ProductionMode,
  pigsToProduce: number,
  matchedProduct: ProducteApi | undefined,
  orders: ComandaDetallApi[],
  categories: CategoriaApi[],
  dateFrom: string,
  dateTo: string,
): ProductionRow {
  const base = {
    id: pigYield.id,
    mode,
    agrupacioRendiment: mode ?? "—",
    agrupacioProduccio: pigYield.agrupacioProduccio ?? "—",
  };

  const unitatsPerPorc = Number(pigYield.unitatsPerPorc);
  const kgPerUnitat = Number(pigYield.kgPerUnitat);

  if (mode === "KG") {
    const pesTotal = calculatePigYieldTotal(unitatsPerPorc, kgPerUnitat);
    const rendiment = Number((pesTotal * pigsToProduce).toFixed(3));
    if (!matchedProduct) {
      return { ...base, paqComanda: null, kgAElaborar: null, rendiment, diferencia: null };
    }
    const demand = aggregateProductDemand(matchedProduct.id, orders, dateFrom, dateTo);
    const diferencia = Number((rendiment - demand.weightKg).toFixed(3));
    return { ...base, paqComanda: demand.units, kgAElaborar: demand.weightKg, rendiment, diferencia };
  }

  if (mode === "PAQ") {
    const rendiment = Number((unitatsPerPorc * pigsToProduce).toFixed(2));
    if (!matchedProduct) {
      return { ...base, paqComanda: null, kgAElaborar: null, rendiment, diferencia: null };
    }
    const demand = aggregateProductDemand(matchedProduct.id, orders, dateFrom, dateTo);
    const diferencia = Number((rendiment - demand.units).toFixed(2));
    return { ...base, paqComanda: demand.units, kgAElaborar: null, rendiment, diferencia };
  }

  const kgAElaborar = aggregateElaboratedDemand(categories, orders, dateFrom, dateTo);
  return { ...base, paqComanda: null, kgAElaborar, rendiment: null, diferencia: null };
}
