"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type RespostaPaginada, type TransportistaApi } from "@/lib/api";

export type CarrierFormValues = Pick<TransportistaApi, "nom" | "codi">;

type UseCarriersResult = {
  data: TransportistaApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createCarrier: (values: CarrierFormValues) => Promise<void>;
  editCarrier: (id: number, values: CarrierFormValues) => Promise<void>;
};

// Mismo criterio de "traer todo" que Categories/Tarifes (volumen chico,
// cabe bajo el máximo de página de 200).
const MIDA_LLISTAT = 200;

export function useCarriers(): UseCarriersResult {
  const [data, setData] = useState<TransportistaApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<RespostaPaginada<TransportistaApi>>("/transportistes", { mida: MIDA_LLISTAT })
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

  // Sin edición optimista, mismo criterio que useCategories.ts: el backend
  // devuelve la fila creada/editada, más simple re-pedir la lista.
  const createCarrier = useCallback(
    async (values: CarrierFormValues) => {
      await api.post<TransportistaApi>("/transportistes", values);
      refetch();
    },
    [refetch],
  );

  const editCarrier = useCallback(
    async (id: number, values: CarrierFormValues) => {
      await api.patch<TransportistaApi>(`/transportistes/${id}`, values);
      refetch();
    },
    [refetch],
  );

  return { data, isLoading, error, refetch, createCarrier, editCarrier };
}
