"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientTariffApi } from "@/lib/api";
import { addMockClient, getMockClientTariffs, updateMockClient } from "@/mocks/clientTariffs";

type UseClientTariffsResult = {
  data: ClientTariffApi[];
  isLoading: boolean;
  error: Error | null;
  createClient: (values: ClientTariffApi) => void;
  editClient: (code: string, values: ClientTariffApi) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockClientTariffs()
// por api.get<ClientTariffApi[]>("/client-tariffs") sin tocar la forma del hook.
export function useClientTariffs(): UseClientTariffsResult {
  const [data, setData] = useState<ClientTariffApi[]>([]);
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

  // TODO: sustituir por mutation real (POST /client-tariffs) cuando exista backend.
  const createClient = useCallback((values: ClientTariffApi) => {
    console.log("create client", values);
    addMockClient(values).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /client-tariffs/:code) cuando exista backend.
  const editClient = useCallback((code: string, values: ClientTariffApi) => {
    console.log("edit client", code, values);
    updateMockClient(code, values).then(setData);
  }, []);

  return { data, isLoading, error, createClient, editClient };
}
