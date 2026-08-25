"use client";

import { useEffect, useState } from "react";
import type { TransportistaApi } from "@/lib/api";
import { getMockCarriers } from "@/mocks/carriers";

type UseCarriersResult = {
  data: TransportistaApi[];
  isLoading: boolean;
  error: Error | null;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockCarriers()
// por api.get<TransportistaApi[]>("/transportistes") sin tocar la forma del hook.
export function useCarriers(): UseCarriersResult {
  const [data, setData] = useState<TransportistaApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockCarriers()
      .then((carriers) => {
        if (!cancelled) setData(carriers);
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

  return { data, isLoading, error };
}
