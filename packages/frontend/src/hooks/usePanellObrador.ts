"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type FilaPanellObradorApi,
  type Paginacio,
  type PanellObradorApi,
  type TotalsPanellObradorApi,
  type TreballLiniaRespostaApi,
} from "@/lib/api";

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

/** Capa 40 — `PATCH .../treball`. El 409 (comanda congelada) no porta `detalls` per camp, mateix criteri que `LliuramentSaveResult`. */
export type ToggleTreballResult = { success: true } | { success: false; error: string };

type UsePanellObradorResult = {
  data: FilaPanellObradorApi[];
  totals: TotalsPanellObradorApi | null;
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  toggleTreball: (comandaId: number, liniaId: number, marcat: boolean) => Promise<ToggleTreballResult>;
};

// Paginació real (20/pàgina). `totals` ve calculat pel backend sobre TOT
// el filtrat (no només `dades`, que sí pagina de veritat) — mai es
// recalcula sumant `dades` acá.
const MIDA_PAGINA = 20;

export function usePanellObrador(filters: WorkshopPanelFilters = {}): UsePanellObradorResult {
  const [data, setData] = useState<FilaPanellObradorApi[]>([]);
  const [totals, setTotals] = useState<TotalsPanellObradorApi | null>(null);
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
      .get<PanellObradorApi>("/panells/obrador", { mida: MIDA_PAGINA, pagina, ...filters })
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

  // No refetegeix la llista sencera en èxit (a diferència de
  // saveLliurament a usePanellEmpaquetat.ts): la resposta del PATCH ja porta
  // el valor real (releguit de la base, no ecoat), n'hi ha prou amb pegar
  // aquesta línia dins `data` — evita el flaix de "carregant..." per un sol
  // click de checkbox.
  const toggleTreball = useCallback(
    async (comandaId: number, liniaId: number, marcat: boolean): Promise<ToggleTreballResult> => {
      try {
        const resposta = await api.patch<TreballLiniaRespostaApi>(
          `/comandes/${comandaId}/linies/${liniaId}/treball`,
          { marcat },
        );
        setData((current) =>
          current.map((line) =>
            line.liniaId === liniaId
              ? { ...line, treballatA: resposta.treballatA, treballatPer: resposta.treballatPer }
              : line,
          ),
        );
        return { success: true };
      } catch (caught) {
        const error = caught instanceof ApiError ? caught.message : "No s'ha pogut actualitzar.";
        return { success: false, error };
      }
    },
    [],
  );

  return { data, totals, paginacio, pagina, setPagina, isLoading, error, refetch, toggleTreball };
}
