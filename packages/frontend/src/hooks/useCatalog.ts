"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ProducteApi, type RespostaPaginada } from "@/lib/api";

export type ProductFormValues = {
  codi: string | null;
  descripcio: string;
  descripcioVenda: string | null;
  categoriaId: number | null;
  agrupacioProduccio: string | null;
  format: ProducteApi["format"];
  envasat: ProducteApi["envasat"];
  pesKg: string | null;
  preuVenda: string | null;
  actiu: boolean;
};

type UseCatalogResult = {
  data: ProducteApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createProduct: (values: ProductFormValues) => Promise<void>;
  editProduct: (id: number, values: ProductFormValues) => Promise<void>;
};

// El màxim de pàgina del contracte és 200 (comu.ts, MIDA_PAGINA_MAXIMA) — el
// catàleg real té ~111 articles, així que un sol GET els trau tots i es
// manté el filtrat client-side que ja fa app/catalog/page.tsx, sense haver
// de recablejar cada filtre a un paràmetre de query.
const MIDA_LLISTAT = 200;

export function useCatalog(): UseCatalogResult {
  const [data, setData] = useState<ProducteApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<RespostaPaginada<ProducteApi>>("/productes", { mida: MIDA_LLISTAT })
      .then((resposta) => {
        if (!cancelled) setData(resposta.dades);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught : new ApiError("ERROR_XARXA", "Error desconegut.", null),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  // El backend espera categoriaId pla al escriure, no l'objecte categoria
  // que sí retorna el GET (productes.ts) — es tradueix acá, no al formulari.
  function aCosApi(values: ProductFormValues) {
    return {
      codi: values.codi,
      descripcio: values.descripcio,
      descripcioVenda: values.descripcioVenda,
      categoriaId: values.categoriaId,
      agrupacioProduccio: values.agrupacioProduccio,
      format: values.format,
      envasat: values.envasat,
      pesKg: values.pesKg,
      preuVenda: values.preuVenda,
      actiu: values.actiu,
    };
  }

  // Sin edición optimista, mismo criterio que useCategories.ts: refetch tras mutación.
  const createProduct = useCallback(
    async (values: ProductFormValues) => {
      await api.post<ProducteApi>("/productes", aCosApi(values));
      refetch();
    },
    [refetch],
  );

  const editProduct = useCallback(
    async (id: number, values: ProductFormValues) => {
      await api.patch<ProducteApi>(`/productes/${id}`, aCosApi(values));
      refetch();
    },
    [refetch],
  );

  return { data, isLoading, error, refetch, createProduct, editProduct };
}
