"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type FilaPanellEmpaquetatApi,
  type LliuramentBodyApi,
  type Paginacio,
  type PanellEmpaquetatApi,
  type TotalsPanellEmpaquetatApi,
} from "@/lib/api";

/**
 * Els 5 filtres reals de GET /panells/empaquetat (confirmat contra
 * panells.ts) — dataLliuramentDes/Fins i producte són capa 37, abans no
 * tenien suport al backend.
 */
export type PackagingPanelFilters = {
  dataExpedicioDes?: string;
  dataExpedicioFins?: string;
  transportistaId?: number;
  clientId?: number;
  dataLliuramentDes?: string;
  dataLliuramentFins?: string;
  producte?: string;
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
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  saveLliurament: (comandaId: number, liniaId: number, body: LliuramentBodyApi) => Promise<LliuramentSaveResult>;
};

// Paginació real (20/pàgina), mateix criteri que usePanellOficina.ts/usePanellObrador.ts.
const MIDA_PAGINA = 20;

export function usePanellEmpaquetat(filters: PackagingPanelFilters = {}): UsePanellEmpaquetatResult {
  const [data, setData] = useState<FilaPanellEmpaquetatApi[]>([]);
  const [totals, setTotals] = useState<TotalsPanellEmpaquetatApi | null>(null);
  const [paginacio, setPaginacio] = useState<Paginacio | null>(null);
  const [pagina, setPagina] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<PanellEmpaquetatApi>("/panells/empaquetat", { mida: MIDA_PAGINA, pagina, ...filters })
      .then((resposta) => {
        if (!cancelled) {
          setData(resposta.dades);
          setTotals(resposta.totals);
          setPaginacio(resposta.paginacio);
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
  }, [reloadToken, pagina, filtersKey]);

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

  return { data, totals, paginacio, pagina, setPagina, isLoading, error, refetch, saveLliurament };
}
