"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type Paginacio, type PanellProduccioApi, type PanellProduccioFilaApi } from "@/lib/api";

/**
 * Els filtres reals de GET /panells/produccio (confirmat contra
 * panells.ts) — OJO: els paràmetres de data acá són `dataDes`/`dataFins`,
 * no `dataProduccioDes`/`dataProduccioFins` com a la resta de panells.
 * `nombrePorcs` és obligatori pel backend (400 sense ell) — el hook no fa
 * el fetch si no és un número > 0, ver `isReady` més avall.
 */
export type ProductionPanelFilters = {
  nombrePorcs: number | null;
  agrupacioRendiment?: string;
  producte?: string;
  dataDes?: string;
  dataFins?: string;
};

type UseProductionPanellResult = {
  data: PanellProduccioFilaApi[];
  totals: PanellProduccioApi["totals"] | null;
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  /** false mentre nombrePorcs no sigui un valor vàlid > 0 — encara no s'ha fet cap fetch. */
  isReady: boolean;
};

// Paginació real (20/pàgina) — les files venen d'un GROUP BY
// (agrupacioProduccio × agrupacioRendiment, ver panells.ts), acotat pel
// catàleg real; en la pràctica és probable que `totalPagines` sigui sempre
// 1, però el component es mostra igual per consistència amb la resta.
const MIDA_PAGINA = 20;

export function useProductionPanell(filters: ProductionPanelFilters): UseProductionPanellResult {
  const [data, setData] = useState<PanellProduccioFilaApi[]>([]);
  const [totals, setTotals] = useState<PanellProduccioApi["totals"] | null>(null);
  const [paginacio, setPaginacio] = useState<Paginacio | null>(null);
  const [pagina, setPagina] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const isReady = filters.nombrePorcs !== null && filters.nombrePorcs > 0;
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    if (!isReady) {
      setData([]);
      setTotals(null);
      setPaginacio(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const { nombrePorcs, ...rest } = filters;
    api
      .get<PanellProduccioApi>("/panells/produccio", { mida: MIDA_PAGINA, pagina, nombrePorcs: nombrePorcs!, ...rest })
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
  }, [reloadToken, pagina, filtersKey, isReady]);

  const refetch = () => setReloadToken((token) => token + 1);

  return { data, totals, paginacio, pagina, setPagina, isLoading, error, refetch, isReady };
}
