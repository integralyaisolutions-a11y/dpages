"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type FilaPanellEmpaquetatApi,
  type LliuramentBodyApi,
  type PanellEmpaquetatApi,
  type TotalsPanellEmpaquetatApi,
} from "@/lib/api";

/**
 * Els 3 filtres reals de GET /panells/empaquetat (confirmat contra
 * panells.ts) — "Data de lliurament" i "Producte" existeixen al mockup
 * però no al backend, no es passen mai acá.
 */
export type PackagingPanelFilters = {
  dataExpedicioDes?: string;
  dataExpedicioFins?: string;
  transportistaId?: number;
  clientId?: number;
};

/**
 * unitatsLliurades/kgLliurats (400, VALIDACIO) arriben amb `detalls` per
 * camp; el 409 CONFLICTE (comanda congelada) no en porta cap — es
 * distingeix acá perquè la fila mostri cadascun on correspon.
 */
export type LliuramentSaveResult =
  | { success: true }
  | { success: false; fieldErrors: Record<string, string>; generalError: string | null };

type UsePanellEmpaquetatResult = {
  data: FilaPanellEmpaquetatApi[];
  totals: TotalsPanellEmpaquetatApi | null;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  saveLliurament: (comandaId: number, liniaId: number, body: LliuramentBodyApi) => Promise<LliuramentSaveResult>;
};

// Mateix criteri que usePanellOficina.ts/usePanellObrador.ts.
const MIDA_LLISTAT = 200;

export function usePanellEmpaquetat(filters: PackagingPanelFilters = {}): UsePanellEmpaquetatResult {
  const [data, setData] = useState<FilaPanellEmpaquetatApi[]>([]);
  const [totals, setTotals] = useState<TotalsPanellEmpaquetatApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<PanellEmpaquetatApi>("/panells/empaquetat", { mida: MIDA_LLISTAT, ...filters })
      .then((resposta) => {
        if (!cancelled) {
          setData(resposta.dades);
          setTotals(resposta.totals);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught : new ApiError("ERROR_XARXA", "Error desconegut.", null));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, filtersKey]);

  const refetch = () => setReloadToken((token) => token + 1);

  const saveLliurament = useCallback(
    async (comandaId: number, liniaId: number, body: LliuramentBodyApi): Promise<LliuramentSaveResult> => {
      try {
        await api.patch(`/comandes/${comandaId}/linies/${liniaId}/lliurament`, body);
        refetch();
        return { success: true };
      } catch (caught) {
        if (caught instanceof ApiError) {
          const fieldErrors: Record<string, string> = {};
          for (const detall of caught.detalls ?? []) fieldErrors[detall.camp] = detall.missatge;
          return {
            success: false,
            fieldErrors,
            generalError: (caught.detalls?.length ?? 0) > 0 ? null : caught.message,
          };
        }
        return { success: false, fieldErrors: {}, generalError: "Error desconegut." };
      }
    },
    [],
  );

  return { data, totals, isLoading, error, refetch, saveLliurament };
}
