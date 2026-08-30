"use client";

import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type FilaPanellOficinaApi,
  type Paginacio,
  type PanellOficinaApi,
  type TotalsPanellOficinaApi,
} from "@/lib/api";

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
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
};

// Paginació real (20/pàgina) — el volum es controla amb els filtres
// server-side, mateix criteri que useOrders.ts.
const MIDA_PAGINA = 20;

export function usePanellOficina(filters: OfficePanelFilters = {}): UsePanellOficinaResult {
  const [data, setData] = useState<FilaPanellOficinaApi[]>([]);
  const [totals, setTotals] = useState<TotalsPanellOficinaApi | null>(null);
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
      .get<PanellOficinaApi>("/panells/oficina", { mida: MIDA_PAGINA, pagina, ...filters })
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

  return { data, totals, paginacio, pagina, setPagina, isLoading, error, refetch };
}
