"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type RolApi } from "@/lib/api";

export type CreateRoleInput = { nom: string; modulsPermesos: string[] };
export type EditRoleInput = Partial<{ nom: string; modulsPermesos: string[] }>;

type UseRolsResult = {
  data: RolApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createRole: (input: CreateRoleInput) => Promise<RolApi>;
  editRole: (id: number, input: EditRoleInput) => Promise<RolApi>;
};

/**
 * GET /rols (contrato §4.12) no pagina — devuelve `{ dades: RolApi[] }` sin
 * `paginacio`, confirmat contra rols.ts. No hi ha DELETE /rols — aquest
 * hook no en té cap funció equivalent, la UI tampoc ofereix l'acció.
 *
 * Rollout de paginació real 2026-08-30: reconfirmat que segueix sense
 * paginar (no hi ha hagut cap canvi de Gerardo) — es deixa aquest hook tal
 * qual, sense `<Pagination>` a users/page.tsx (pestanya Rols), fins que el
 * backend l'exposi. Volum real ~7 rols, no urgeix.
 */
export function useRols(): UseRolsResult {
  const [data, setData] = useState<RolApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<{ dades: RolApi[] }>("/rols")
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
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  const createRole = useCallback(
    async (input: CreateRoleInput): Promise<RolApi> => {
      const resposta = await api.post<RolApi>("/rols", input);
      refetch();
      return resposta;
    },
    [refetch],
  );

  const editRole = useCallback(
    async (id: number, input: EditRoleInput): Promise<RolApi> => {
      const resposta = await api.patch<RolApi>(`/rols/${id}`, input);
      refetch();
      return resposta;
    },
    [refetch],
  );

  return { data, isLoading, error, refetch, createRole, editRole };
}
