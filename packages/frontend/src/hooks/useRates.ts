"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type FilaMatriuTarifesApi, type Paginacio, type TarifaResumApi } from "@/lib/api";

export type CellSaveResult =
  | { tarifaId: string; success: true }
  | { tarifaId: string; success: false; error: ApiError };

export type RatesFilters = { cerca?: string };

type UseRatesResult = {
  data: FilaMatriuTarifesApi[];
  tariffColumns: TarifaResumApi[];
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  savePrices: (
    producteId: number,
    changes: Record<string, string>,
    deletions: string[],
  ) => Promise<CellSaveResult[]>;
  createTariff: (codi: string, nom: string) => Promise<void>;
};

// Paginació real de files (20/pàgina) — `tariffColumns` NO forma part
// d'aquesta paginació: `/tarifes/matriu` sempre el retorna sencer (és la
// llista de columnes de la matriu, no una fila més), per això els altres 4
// llocs que criden aquest hook només per `tariffColumns`
// (client-tariffs/office/orders new/[id]) segueixen veient-les totes sense
// cap canvi encara que aquí es paginin les files.
const MIDA_PAGINA = 20;

export function useRates(filters: RatesFilters = {}): UseRatesResult {
  const [data, setData] = useState<FilaMatriuTarifesApi[]>([]);
  const [tariffColumns, setTariffColumns] = useState<TarifaResumApi[]>([]);
  const [paginacio, setPaginacio] = useState<Paginacio | null>(null);
  const [pagina, setPagina] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  // Un canvi de filtre (cerca) torna a la pàgina 1 — evita quedar-se en una
  // pàgina que ja no existeix pel nou resultat filtrat.
  useEffect(() => {
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<{ tarifes: TarifaResumApi[]; dades: FilaMatriuTarifesApi[]; paginacio: Paginacio }>(
        "/tarifes/matriu",
        { mida: MIDA_PAGINA, pagina, ...filters },
      )
      .then((resposta) => {
        if (!cancelled) {
          setData(resposta.dades);
          setTariffColumns(resposta.tarifes);
          setPaginacio(resposta.paginacio);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, pagina, filtersKey]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  // Una PATCH por celda cambiada y un DELETE por celda vaciada (capa 28: el
  // backend ya soporta borrar una fila de tarifa_preu para volver a "sin
  // precio en esta tarifa") — el contrato no soporta guardar toda la fila
  // de una vez. Promise.all en vez de fallar rápido: el backend no
  // garantiza atomicidad entre celdas, así que cada una se resuelve
  // independiente y se informa cuál falló, no todo-o-nada.
  const savePrices = useCallback(
    async (
      producteId: number,
      changes: Record<string, string>,
      deletions: string[],
    ): Promise<CellSaveResult[]> => {
      const patches = Object.entries(changes).map(async ([tarifaId, preu]): Promise<CellSaveResult> => {
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
      });
      const deletes = deletions.map(async (tarifaId): Promise<CellSaveResult> => {
        try {
          await api.delete(`/tarifes/${tarifaId}/preus/${producteId}`);
          return { tarifaId, success: true };
        } catch (caught) {
          return {
            tarifaId,
            success: false,
            error: caught instanceof ApiError ? caught : new ApiError("ERROR_XARXA", "Error desconegut.", null),
          };
        }
      });
      const results = await Promise.all([...patches, ...deletes]);
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

  return { data, tariffColumns, paginacio, pagina, setPagina, isLoading, error, refetch, savePrices, createTariff };
}
