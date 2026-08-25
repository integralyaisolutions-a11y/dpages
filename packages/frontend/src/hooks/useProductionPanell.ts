"use client";

import { useEffect, useMemo, useState } from "react";
import type { CategoriaApi, ComandaDetallApi, ProducteApi, RendimentPorcApi } from "@/lib/api";
import { buildProductionRow, findMatchingProduct, type ProductionMode, type ProductionRow } from "@/lib/productionCalculations";
import { getMockCatalog } from "@/mocks/catalog";
import { getMockCategories } from "@/mocks/categories";
import { getMockOrders } from "@/mocks/orders";
import { getMockPigYields } from "@/mocks/pigYields";

type UseProductionPanellResult = {
  rows: ProductionRow[];
  isLoading: boolean;
  error: Error | null;
};

export function useProductionPanell(
  pigsToProduce: number,
  dateFrom: string,
  dateTo: string,
): UseProductionPanellResult {
  const [pigYields, setPigYields] = useState<RendimentPorcApi[]>([]);
  const [categories, setCategories] = useState<CategoriaApi[]>([]);
  const [products, setProducts] = useState<ProducteApi[]>([]);
  const [orders, setOrders] = useState<ComandaDetallApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getMockPigYields(), getMockCategories(), getMockCatalog(), getMockOrders()])
      .then(([fetchedPigYields, fetchedCategories, fetchedProducts, fetchedOrders]) => {
        if (!cancelled) {
          setPigYields(fetchedPigYields);
          setCategories(fetchedCategories);
          setProducts(fetchedProducts);
          setOrders(fetchedOrders);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () =>
      pigYields.map((pigYield) => {
        const mode: ProductionMode =
          pigYield.agrupacioRendiment === "MAGRE" ||
          pigYield.agrupacioRendiment === "KG" ||
          pigYield.agrupacioRendiment === "PAQ"
            ? pigYield.agrupacioRendiment
            : null;
        const matchedProduct =
          mode === "KG" || mode === "PAQ"
            ? findMatchingProduct(pigYield.agrupacioProduccio ?? "", products)
            : undefined;
        return buildProductionRow(pigYield, mode, pigsToProduce, matchedProduct, orders, categories, dateFrom, dateTo);
      }),
    [pigYields, categories, products, orders, pigsToProduce, dateFrom, dateTo],
  );

  return { rows, isLoading, error };
}
