"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type FilaPanellOficinaApi, type PanellOficinaApi, type TotalsPanellOficinaApi } from "@/lib/api";

/**
 * Els 8 filtres reals de GET /panells/oficina (contrato §4.6, confirmat
 * contra panells.ts) — capa 35 va afegir tarifaId/poblacioDesti i els
 * rangos dataComandaDes/Fins i dataLliuramentDes/Fins.
 */
export type OfficePanelFilters = {
  estat?: string;
  transportistaId?: number;
  clientId?: number;
  tarifaId?: number;
  poblacioDesti?: string;
  dataExpedicioDes?: string;
  dataExpedicioFins?: string;
  dataComandaDes?: string;
  dataComandaFins?: string;
  dataLliuramentDes?: string;
  dataLliuramentFins?: string;
};

type UsePanellOficinaResult = {
  data: FilaPanellOficinaApi[];
  totals: TotalsPanellOficinaApi | null;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
};

// Mismo criterio que useOrders.ts: el màxim de pàgina del contracte (200)
// es manté fix, el volum real es controla amb els filtres server-side, no
// baixant tot i filtrant client-side (a diferencia de Categories/Catàleg).
const MIDA_LLISTAT = 200;

export function usePanellOficina(filters: OfficePanelFilters = {}): UsePanellOficinaResult {
  const [data, setData] = useState<FilaPanellOficinaApi[]>([]);
  const [totals, setTotals] = useState<TotalsPanellOficinaApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<PanellOficinaApi>("/panells/oficina", { mida: MIDA_LLISTAT, ...filters })
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

  return { data, totals, isLoading, error, refetch };
}
