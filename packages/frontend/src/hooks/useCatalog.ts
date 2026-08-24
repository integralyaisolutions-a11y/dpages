"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductApi } from "@/lib/api";
import { addMockProduct, getMockCatalog, updateMockProduct } from "@/mocks/catalog";

type UseCatalogResult = {
  data: ProductApi[];
  isLoading: boolean;
  error: Error | null;
  createProduct: (values: ProductApi) => void;
  editProduct: (code: string, values: ProductApi) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockCatalog()
// por api.get<ProductApi[]>("/catalog") sin tocar la forma del hook.
export function useCatalog(): UseCatalogResult {
  const [data, setData] = useState<ProductApi[]>([]);
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

  // TODO: sustituir por mutation real (POST /catalog) cuando exista backend.
  const createProduct = useCallback((values: ProductApi) => {
    console.log("create product", values);
    addMockProduct(values).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /catalog/:code) cuando exista backend.
  const editProduct = useCallback((code: string, values: ProductApi) => {
    console.log("edit product", code, values);
    updateMockProduct(code, values).then(setData);
  }, []);

  return { data, isLoading, error, createProduct, editProduct };
}
