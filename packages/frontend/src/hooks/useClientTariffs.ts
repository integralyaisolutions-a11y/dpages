"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ClientApi, type RespostaPaginada } from "@/lib/api";

export type ClientFormValues = {
  nom: string;
  poblacio: string;
  tarifaId: number | null;
  nif: string | null;
  email: string | null;
  telefon: string | null;
};

type UseClientTariffsResult = {
  data: ClientApi[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createClient: (values: ClientFormValues) => Promise<void>;
  editClient: (id: number, values: ClientFormValues) => Promise<void>;
};

// Mismo criterio que Categories/Catàleg/Tarifes: el màxim de pàgina del
// contracte és 200 i el volum real cap còmodament, així que es trau tot
// d'un GET i es manté el filtrat client-side.
const MIDA_LLISTAT = 200;

export function useClientTariffs(): UseClientTariffsResult {
  const [data, setData] = useState<ClientApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<RespostaPaginada<ClientApi>>("/clients", { mida: MIDA_LLISTAT })
      .then((resposta) => {
        if (!cancelled) setData(resposta.dades);
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
  }, [reloadToken]);

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

  return { data, isLoading, error, refetch, createClient, editClient };
}
