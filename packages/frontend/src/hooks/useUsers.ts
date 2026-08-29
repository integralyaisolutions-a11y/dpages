"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type RespostaPaginada,
  type UsuariApi,
  type UsuariCreatRespostaApi,
} from "@/lib/api";

export type UserFilters = {
  actiu?: boolean;
};

export type CreateUserInput = { nom: string; email: string; rolId: number };
export type EditUserInput = Partial<{ nom: string; rolId: number; actiu: boolean }>;

type UseUsersResult = {
  data: UsuariApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createUser: (input: CreateUserInput) => Promise<UsuariCreatRespostaApi>;
  editUser: (id: number, input: EditUserInput) => Promise<UsuariApi>;
};

// GET /usuaris pagina (contrato §4.12) — el volum real (equip de ~10
// persones) cap sobradament sota el màxim de pàgina (200), mateix criteri
// que Categories/Tarifes/Transportistes.
const MIDA_LLISTAT = 200;

export function useUsers(filters: UserFilters = {}): UseUsersResult {
  const [data, setData] = useState<UsuariApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<RespostaPaginada<UsuariApi>>("/usuaris", { mida: MIDA_LLISTAT, ...filters })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, filtersKey]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  // Els 400 (camp/email) i 409 (email duplicat) los mapea directament el
  // formulario que llama a createUser/editUser, capturando ApiError — mismo
  // criteri que ProductForm.tsx/PigYieldFormModal.tsx, sin envoltori acá.
  const createUser = useCallback(
    async (input: CreateUserInput): Promise<UsuariCreatRespostaApi> => {
      const resposta = await api.post<UsuariCreatRespostaApi>("/usuaris", input);
      refetch();
      return resposta;
    },
    [refetch],
  );

  const editUser = useCallback(
    async (id: number, input: EditUserInput): Promise<UsuariApi> => {
      const resposta = await api.patch<UsuariApi>(`/usuaris/${id}`, input);
      refetch();
      return resposta;
    },
    [refetch],
  );

  return { data, isLoading, error, refetch, createUser, editUser };
}
