"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type RendimentPorcApi,
  type RendimentPorcEntradaApi,
  type RespostaPaginada,
} from "@/lib/api";

export type PigYieldPatch = Partial<Pick<RendimentPorcApi, "unitatsPerPorc" | "kgPerUnitat">>;

export type PigYieldFilters = {
  categoria?: string;
};

type UsePigYieldsResult = {
  data: RendimentPorcApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createPigYield: (values: RendimentPorcEntradaApi) => Promise<void>;
  updatePigYield: (id: number, patch: PigYieldPatch) => Promise<void>;
  deletePigYield: (id: number) => Promise<void>;
};

// El catàleg real té ~111 articles i cada rendiment és 1 línia per producte
// com a molt — 200 (el màxim de pàgina del contracte) hi cap sencer, mateix
// criteri que useCatalog.ts.
const MIDA_LLISTAT = 200;

export function usePigYields(filters: PigYieldFilters = {}): UsePigYieldsResult {
  const [data, setData] = useState<RendimentPorcApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<RespostaPaginada<RendimentPorcApi>>("/rendiments-porcs", { mida: MIDA_LLISTAT, ...filters })
      .then((resposta) => {
        if (!cancelled) setData(resposta.dades);
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
    // filtersKey serialitza `filters` (objecte pla de primitives) — evita
    // refer la petició en cada render per canvi d'identitat de l'objecte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, filtersKey]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  // Sin edición optimista, mismo criterio que useCategories.ts/useCatalog.ts:
  // refetch tras mutación. agrupacioRendiment/categoria/agrupacioProduccio
  // NO viatgen mai en aquest POST — el backend els deriva de producteId i els
  // rebutja/ignora si es manden (investigació confirmada amb curl real).
  const createPigYield = useCallback(
    async (entrada: RendimentPorcEntradaApi) => {
      await api.post<RendimentPorcApi>("/rendiments-porcs", entrada);
      refetch();
    },
    [refetch],
  );

  // producteId no forma part del payload de PATCH (el backend no l'accepta,
  // confirmat: el producte d'una línia és fix un cop creada).
  const updatePigYield = useCallback(
    async (id: number, patch: PigYieldPatch) => {
      await api.patch<RendimentPorcApi>(`/rendiments-porcs/${id}`, patch);
      refetch();
    },
    [refetch],
  );

  const deletePigYield = useCallback(
    async (id: number) => {
      await api.delete(`/rendiments-porcs/${id}`);
      refetch();
    },
    [refetch],
  );

  return { data, isLoading, error, refetch, createPigYield, updatePigYield, deletePigYield };
}
