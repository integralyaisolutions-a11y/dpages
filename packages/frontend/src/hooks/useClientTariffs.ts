"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientApi } from "@/lib/api";
import { addMockClient, getMockClientTariffs, updateMockClient } from "@/mocks/clientTariffs";

type UseClientTariffsResult = {
  data: ClientApi[];
  isLoading: boolean;
  error: Error | null;
  createClient: (values: Omit<ClientApi, "id">) => void;
  editClient: (codi: string, values: ClientApi) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockClientTariffs()
// por api.get<ClientApi[]>("/clients") sin tocar la forma del hook.
export function useClientTariffs(): UseClientTariffsResult {
  const [data, setData] = useState<ClientApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockClientTariffs()
      .then((clients) => {
        if (!cancelled) setData(clients);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // TODO: sustituir por mutation real (POST /clients) cuando exista backend.
  const createClient = useCallback((values: Omit<ClientApi, "id">) => {
    console.log("create client", values);
    addMockClient(values).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /clients/:id) cuando exista backend.
  const editClient = useCallback((codi: string, values: ClientApi) => {
    console.log("edit client", codi, values);
    updateMockClient(codi, values).then(setData);
  }, []);

  return { data, isLoading, error, createClient, editClient };
}
