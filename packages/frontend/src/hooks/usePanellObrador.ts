"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type FilaPanellObradorApi, type PanellObradorApi, type TotalsPanellObradorApi } from "@/lib/api";

/**
 * Els 4 filtres reals de GET /panells/obrador (contrato §4.7, confirmat
 * contra panells.ts) — categoriaId/tipus existeixen al backend però no
 * formen part del disseny d'aquesta pantalla, no es passen mai acá.
 */
export type WorkshopPanelFilters = {
  producte?: string;
  format?: string;
  envasat?: string;
  dataProduccioDes?: string;
  dataProduccioFins?: string;
};

type UsePanellObradorResult = {
  data: FilaPanellObradorApi[];
  totals: TotalsPanellObradorApi | null;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
};

// Mateix criteri que usePanellOficina.ts: el màxim de pàgina del contracte
// (200) es manté fix, el volum real es controla amb els filtres
// server-side. `totals` ve calculat pel backend sobre TOT el filtrat (no
// només `dades`, que sí pagina de veritat) — mai es recalcula sumant
// `dades` acá.
const MIDA_LLISTAT = 200;

export function usePanellObrador(filters: WorkshopPanelFilters = {}): UsePanellObradorResult {
  const [data, setData] = useState<FilaPanellObradorApi[]>([]);
  const [totals, setTotals] = useState<TotalsPanellObradorApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<PanellObradorApi>("/panells/obrador", { mida: MIDA_LLISTAT, ...filters })
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
