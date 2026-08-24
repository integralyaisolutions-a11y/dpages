"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductRateApi, TariffApi } from "@/lib/api";
import { addMockTariff, getMockRates, getMockTariffColumns, updateMockPrices } from "@/mocks/rates";

type UseRatesResult = {
  data: ProductRateApi[];
  tariffColumns: TariffApi[];
  isLoading: boolean;
  error: Error | null;
  updatePrices: (productCode: string, prices: Record<string, number | null>) => void;
  createTariff: (code: string, name: string) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockRates()/getMockTariffColumns()
// por las llamadas reales a api.ts sin tocar la forma del hook.
export function useRates(): UseRatesResult {
  const [data, setData] = useState<ProductRateApi[]>([]);
  const [tariffColumns, setTariffColumns] = useState<TariffApi[]>([]);
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

  // TODO: sustituir por mutation real (PATCH /rates/:productCode) cuando exista backend.
  const updatePrices = useCallback((productCode: string, prices: Record<string, number | null>) => {
    console.log("update prices", productCode, prices);
    updateMockPrices(productCode, prices).then(setData);
  }, []);

  // TODO: sustituir por mutation real (POST /tariffs) cuando exista backend.
  const createTariff = useCallback((code: string, name: string) => {
    console.log("create tariff", code, name);
    addMockTariff({ code, name }).then((result) => {
      setTariffColumns(result.tariffColumns);
      setData(result.data);
    });
  }, []);

  return { data, tariffColumns, isLoading, error, updatePrices, createTariff };
}
