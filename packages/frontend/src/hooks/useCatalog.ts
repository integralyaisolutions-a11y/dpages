"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProducteApi } from "@/lib/api";
import { addMockProduct, getMockCatalog, updateMockProduct } from "@/mocks/catalog";

type UseCatalogResult = {
  data: ProducteApi[];
  isLoading: boolean;
  error: Error | null;
  createProduct: (values: Omit<ProducteApi, "id">) => void;
  editProduct: (codi: string, values: ProducteApi) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockCatalog()
// por api.get<ProducteApi[]>("/productes") sin tocar la forma del hook.
export function useCatalog(): UseCatalogResult {
  const [data, setData] = useState<ProducteApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockCatalog()
      .then((products) => {
        if (!cancelled) setData(products);
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

  // TODO: sustituir por mutation real (POST /productes) cuando exista backend.
  const createProduct = useCallback((values: Omit<ProducteApi, "id">) => {
    console.log("create product", values);
    addMockProduct(values).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /productes/:id) cuando exista backend.
  const editProduct = useCallback((codi: string, values: ProducteApi) => {
    console.log("edit product", codi, values);
    updateMockProduct(codi, values).then(setData);
  }, []);

  return { data, isLoading, error, createProduct, editProduct };
}
