"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type Paginacio,
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
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createUser: (input: CreateUserInput) => Promise<UsuariCreatRespostaApi>;
  editUser: (id: number, input: EditUserInput) => Promise<UsuariApi>;
};

// Paginació real (20/pàgina). GET /usuaris no accepta cerca per nom/email
// (només `actiu`, confirmat contra usuaris.ts) — el buscador de la pantalla
// segueix filtrant client-side sobre la pàgina actual, ver comentari a
// app/users/page.tsx.
const MIDA_PAGINA = 20;

export function useUsers(filters: UserFilters = {}): UseUsersResult {
  const [data, setData] = useState<UsuariApi[]>([]);
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
      .get<RespostaPaginada<UsuariApi>>("/usuaris", { mida: MIDA_PAGINA, pagina, ...filters })
      .then((resposta) => {
        if (!cancelled) {
          setData(resposta.dades);
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

  return { data, paginacio, pagina, setPagina, isLoading, error, refetch, createUser, editUser };
}
