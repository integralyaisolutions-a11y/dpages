"use client";

import { useEffect, useState } from "react";
import { getMockPigConfig, type PigConfig } from "@/mocks/pigConfig";

type UsePigConfigResult = {
  data: PigConfig | null;
  isLoading: boolean;
  error: Error | null;
};

export function usePigConfig(): UsePigConfigResult {
  const [data, setData] = useState<PigConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockPigConfig()
      .then((config) => {
        if (!cancelled) setData(config);
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
