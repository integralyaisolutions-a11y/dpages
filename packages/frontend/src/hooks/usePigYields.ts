"use client";

import { useCallback, useEffect, useState } from "react";
import type { PigYieldApi } from "@/lib/api";
import { addMockPigYield, deleteMockPigYield, getMockPigYields, updateMockPigYield } from "@/mocks/pigYields";

export type PigYieldPatch = Partial<Pick<PigYieldApi, "unitsPerPig" | "kgPerUnit">>;

type UsePigYieldsResult = {
  data: PigYieldApi[];
  isLoading: boolean;
  error: Error | null;
  createPigYield: (values: Omit<PigYieldApi, "id">) => void;
  updatePigYield: (id: string, patch: PigYieldPatch) => void;
  deletePigYield: (id: string) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockPigYields()
// por api.get<PigYieldApi[]>("/pig-yields") sin tocar la forma del hook.
export function usePigYields(): UsePigYieldsResult {
  const [data, setData] = useState<PigYieldApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockPigYields()
      .then((pigYields) => {
        if (!cancelled) setData(pigYields);
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

  // TODO: sustituir por mutation real (POST /pig-yields) cuando exista backend.
  const createPigYield = useCallback((values: Omit<PigYieldApi, "id">) => {
    addMockPigYield({ id: crypto.randomUUID(), ...values }).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /pig-yields/:id) cuando exista backend.
  const updatePigYield = useCallback(
    (id: string, patch: PigYieldPatch) => {
      const target = data.find((item) => item.id === id);
      if (!target) return;
      updateMockPigYield(id, { ...target, ...patch }).then(setData);
    },
    [data],
  );

  // TODO: sustituir por mutation real (DELETE /pig-yields/:id) contra el backend.
  const deletePigYield = useCallback((id: string) => {
    deleteMockPigYield(id).then(setData);
  }, []);

  return { data, isLoading, error, createPigYield, updatePigYield, deletePigYield };
}
