"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type RespostaPaginada, type TransportistaApi } from "@/lib/api";

type UseCarriersResult = {
  data: TransportistaApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
};

// Sólo lectura: esta pantalla no gestiona transportistes, sólo los consume
// para el select de Comandes. Mismo criterio de "traer todo" que
// Categories/Tarifes (volumen chico, cabe bajo el máximo de página de 200).
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

  return { data, isLoading, error, refetch };
}
