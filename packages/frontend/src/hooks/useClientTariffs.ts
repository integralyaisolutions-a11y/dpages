"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ClientApi, type Paginacio, type RespostaPaginada } from "@/lib/api";

export type ClientFormValues = {
  nom: string;
  poblacio: string;
  tarifaId: number | null;
  nif: string | null;
  email: string | null;
  telefon: string | null;
};

export type ClientTariffsFilters = { cerca?: string };

/**
 * `mida` per defecte es manté a 200 (no 20): `useClientTariffs()` es fa
 * servir com a taula de consulta completa en 5 llocs fora de la seva
 * pròpia pantalla (packaging, office, orders/page, orders/new, orders/[id])
 * per resoldre nom/codi de client — necessiten TOTS els clients, no una
 * pàgina de 20. Només `app/client-tariffs/page.tsx` passa `mida: 20`
 * explícit per paginar de veritat la seva pròpia llista.
 */
export type UseClientTariffsParams = { mida?: number };

type UseClientTariffsResult = {
  data: ClientApi[];
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createClient: (values: ClientFormValues) => Promise<void>;
  editClient: (id: number, values: ClientFormValues) => Promise<void>;
};

const MIDA_PER_DEFECTE = 200;

export function useClientTariffs(
  filters: ClientTariffsFilters = {},
  params: UseClientTariffsParams = {},
): UseClientTariffsResult {
  const { mida = MIDA_PER_DEFECTE } = params;
  const [data, setData] = useState<ClientApi[]>([]);
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
      .get<RespostaPaginada<ClientApi>>("/clients", { mida, pagina, ...filters })
      .then((resposta) => {
        if (!cancelled) {
          setData(resposta.dades);
          setPaginacio(resposta.paginacio);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught : new ApiError("ERROR_XARXA", "Error desconegut.", null),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, pagina, mida, filtersKey]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  const createClient = useCallback(
    async (values: ClientFormValues) => {
      // codi no se manda: el backend lo autogenera siempre (capa 29), lo
      // ignoraría igual si viajara. POST /clients tampoco acepta
      // tarifaId: null (sólo PATCH tiene esa rama) — confirmado con curl
      // real: mandarlo explícito da un 400 falso ("la tarifa no existeix").
      // "Sense tarifa" en alta = directamente omitir la clave, no mandarla
      // en null.
      const cos: Record<string, unknown> = {
        nom: values.nom,
        poblacio: values.poblacio,
        nif: values.nif,
        email: values.email,
        telefon: values.telefon,
      };
      if (values.tarifaId !== null) cos.tarifaId = values.tarifaId;
      await api.post<ClientApi>("/clients", cos);
      refetch();
    },
    [refetch],
  );

  const editClient = useCallback(
    async (id: number, values: ClientFormValues) => {
      // codi no se manda: es de sólo lectura para siempre, el backend lo
      // ignoraría igual (ver PATCH /clients/:id). transportistaDefecteId
      // tampoco se manda: esta pantalla no lo toca.
      await api.patch<ClientApi>(`/clients/${id}`, {
        nom: values.nom,
        poblacio: values.poblacio,
        nif: values.nif,
        email: values.email,
        telefon: values.telefon,
        tarifaId: values.tarifaId,
      });
      refetch();
    },
    [refetch],
  );

  return { data, paginacio, pagina, setPagina, isLoading, error, refetch, createClient, editClient };
}
