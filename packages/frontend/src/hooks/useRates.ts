"use client";

import { useCallback, useEffect, useState } from "react";
import type { FilaMatriuTarifesApi, TarifaResumApi } from "@/lib/api";
import { addMockTariff, getMockRates, getMockTariffColumns, updateMockPrices } from "@/mocks/rates";

type UseRatesResult = {
  data: FilaMatriuTarifesApi[];
  tariffColumns: TarifaResumApi[];
  isLoading: boolean;
  error: Error | null;
  updatePrices: (producteId: number, preus: Record<string, string | null>) => void;
  createTariff: (codi: string, nom: string) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockRates()/getMockTariffColumns()
// por las llamadas reales a api.ts sin tocar la forma del hook.
export function useRates(): UseRatesResult {
  const [data, setData] = useState<FilaMatriuTarifesApi[]>([]);
  const [tariffColumns, setTariffColumns] = useState<TarifaResumApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getMockRates(), getMockTariffColumns()])
      .then(([rates, columns]) => {
        if (!cancelled) {
          setData(rates);
          setTariffColumns(columns);
        }
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

  // TODO: sustituir por mutation real (PATCH /tarifes/:tarifaId/preus/:producteId, una celda por vez) cuando exista backend.
  const updatePrices = useCallback((producteId: number, preus: Record<string, string | null>) => {
    console.log("update prices", producteId, preus);
    updateMockPrices(producteId, preus).then(setData);
  }, []);

  // TODO: sustituir por mutation real (POST /tarifes) cuando exista backend.
  const createTariff = useCallback((codi: string, nom: string) => {
    console.log("create tariff", codi, nom);
    addMockTariff({ codi, nom }).then((result) => {
      setTariffColumns(result.tariffColumns);
      setData(result.data);
    });
  }, []);

  return { data, tariffColumns, isLoading, error, updatePrices, createTariff };
}
