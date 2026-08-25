"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type CategoriaApi, type RespostaPaginada } from "@/lib/api";

export type CategoryFormValues = Pick<CategoriaApi, "nom" | "elaboratPorc" | "agrupacioRendiment">;

type UseCategoriesResult = {
  data: CategoriaApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createCategory: (values: CategoryFormValues) => Promise<void>;
  editCategory: (id: number, values: CategoryFormValues) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
};

// Sin control de paginación en esta pantalla todavía (hoy son 8 categorías,
// contrato §1 confirma 200 como el máximo permitido) — si el listado de
// categorías creciera más allá de esto, hace falta agregar paginación real.
const MIDA_LLISTAT = 200;

export function useCategories(): UseCategoriesResult {
  const [data, setData] = useState<CategoriaApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<RespostaPaginada<CategoriaApi>>("/categories", { mida: MIDA_LLISTAT })
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

  // Sin edición optimista a propósito: el backend devuelve la fila
  // creada/editada, no la lista completa (a diferencia del mock viejo) —
  // más simple y confiable re-pedir la lista que reconstruirla a mano.
  const createCategory = useCallback(
    async (values: CategoryFormValues) => {
      await api.post<CategoriaApi>("/categories", values);
      refetch();
    },
    [refetch],
  );

  const editCategory = useCallback(
    async (id: number, values: CategoryFormValues) => {
      await api.patch<CategoriaApi>(`/categories/${id}`, values);
      refetch();
    },
    [refetch],
  );

  const deleteCategory = useCallback(
    async (id: number) => {
      await api.delete(`/categories/${id}`);
      refetch();
    },
    [refetch],
  );

  return { data, isLoading, error, refetch, createCategory, editCategory, deleteCategory };
}
