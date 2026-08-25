"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type FilaMatriuTarifesApi, type TarifaResumApi } from "@/lib/api";

export type CellSaveResult =
  | { tarifaId: string; success: true }
  | { tarifaId: string; success: false; error: ApiError };

type UseRatesResult = {
  data: FilaMatriuTarifesApi[];
  tariffColumns: TarifaResumApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  savePrices: (producteId: number, changes: Record<string, string>) => Promise<CellSaveResult[]>;
  createTariff: (codi: string, nom: string) => Promise<void>;
};

// Igual que Categories/Catàleg: el màxim de pàgina del contracte és 200
// (comu.ts, MIDA_PAGINA_MAXIMA) i el catàleg real té ~111 articles, així
// que un sol GET els trau tots i es manté el filtrat client-side.
const MIDA_LLISTAT = 200;

export function useRates(): UseRatesResult {
  const [data, setData] = useState<FilaMatriuTarifesApi[]>([]);
  const [tariffColumns, setTariffColumns] = useState<TarifaResumApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<{ tarifes: TarifaResumApi[]; dades: FilaMatriuTarifesApi[] }>("/tarifes/matriu", { mida: MIDA_LLISTAT })
      .then((resposta) => {
        if (!cancelled) {
          setData(resposta.dades);
          setTariffColumns(resposta.tarifes);
        }
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

  // Una PATCH por celda cambiada (el contrato no soporta guardar toda la
  // fila de una vez) — Promise.all en vez de fallar rápido: el backend no
  // garantiza atomicidad entre celdas, así que cada una se resuelve
  // independiente y se informa cuál falló, no todo-o-nada.
  const savePrices = useCallback(
    async (producteId: number, changes: Record<string, string>): Promise<CellSaveResult[]> => {
      const results = await Promise.all(
        Object.entries(changes).map(async ([tarifaId, preu]): Promise<CellSaveResult> => {
          try {
            await api.patch(`/tarifes/${tarifaId}/preus/${producteId}`, { preu });
            return { tarifaId, success: true };
          } catch (caught) {
            return {
              tarifaId,
              success: false,
              error: caught instanceof ApiError ? caught : new ApiError("ERROR_XARXA", "Error desconegut.", null),
            };
          }
        }),
      );
      refetch();
      return results;
    },
    [refetch],
  );

  // POST /tarifes no devuelve la matriz — hace falta un refetch completo
  // para que la columna nueva aparezca con sus celdas inicializadas en null.
  const createTariff = useCallback(
    async (codi: string, nom: string) => {
      await api.post<TarifaResumApi>("/tarifes", { codi, nom });
      refetch();
    },
    [refetch],
  );

  return { data, tariffColumns, isLoading, error, refetch, savePrices, createTariff };
}
