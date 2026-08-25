"use client";

import { useCallback, useEffect, useState } from "react";
import type { RendimentPorcApi, RendimentPorcEntradaApi } from "@/lib/api";
import { getMockCatalog } from "@/mocks/catalog";
import { getMockCategories } from "@/mocks/categories";
import { addMockPigYield, deleteMockPigYield, getMockPigYields, updateMockPigYield } from "@/mocks/pigYields";

export type PigYieldPatch = Partial<Pick<RendimentPorcApi, "unitatsPerPorc" | "kgPerUnitat">>;

type UsePigYieldsResult = {
  data: RendimentPorcApi[];
  isLoading: boolean;
  error: Error | null;
  createPigYield: (values: RendimentPorcEntradaApi) => void;
  updatePigYield: (id: number, patch: PigYieldPatch) => void;
  deletePigYield: (id: number) => void;
};

function recomputePesTotal(unitatsPerPorc: string, kgPerUnitat: string): string {
  return (Number(unitatsPerPorc) * Number(kgPerUnitat)).toFixed(3);
}

// TODO: cuando cierre el contrato con el backend, reemplazar getMockPigYields()
// por api.get<RendimentPorcApi[]>("/rendiments-porcs") sin tocar la forma del hook.
export function usePigYields(): UsePigYieldsResult {
  const [data, setData] = useState<RendimentPorcApi[]>([]);
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

  // TODO: sustituir por mutation real (POST /rendiments-porcs) cuando exista backend.
  // agrupacioRendiment/categoria/agrupacioProduccio se derivan del producte
  // elegido (mismo criterio que el backend real, contrato §4.9: son de sólo
  // lectura, no se envían en la escritura) — acá el mock los resuelve a mano
  // porque no hay servidor que lo haga todavía.
  const createPigYield = useCallback((entrada: RendimentPorcEntradaApi) => {
    Promise.all([getMockCatalog(), getMockCategories()]).then(([products, categories]) => {
      const product = products.find((item) => item.id === entrada.producteId);
      const categoria = categories.find((item) => item.id === product?.categoria?.id);
      addMockPigYield({
        agrupacioRendiment: categoria?.agrupacioRendiment ?? "KG",
        categoria: product?.categoria?.nom ?? "—",
        agrupacioProduccio: product?.agrupacioProduccio ?? null,
        unitatsPerPorc: entrada.unitatsPerPorc,
        kgPerUnitat: entrada.kgPerUnitat,
        pesTotal: recomputePesTotal(entrada.unitatsPerPorc, entrada.kgPerUnitat),
      }).then(setData);
    });
  }, []);

  // TODO: sustituir por mutation real (PATCH /rendiments-porcs/:id) cuando exista backend.
  const updatePigYield = useCallback(
    (id: number, patch: PigYieldPatch) => {
      const target = data.find((item) => item.id === id);
      if (!target) return;
      const unitatsPerPorc = patch.unitatsPerPorc ?? target.unitatsPerPorc;
      const kgPerUnitat = patch.kgPerUnitat ?? target.kgPerUnitat;
      updateMockPigYield(id, {
        ...target,
        unitatsPerPorc,
        kgPerUnitat,
        pesTotal: recomputePesTotal(unitatsPerPorc, kgPerUnitat),
      }).then(setData);
    },
    [data],
  );

  // TODO: sustituir por mutation real (DELETE /rendiments-porcs/:id) contra el backend.
  const deletePigYield = useCallback((id: number) => {
    deleteMockPigYield(id).then(setData);
  }, []);

  return { data, isLoading, error, createPigYield, updatePigYield, deletePigYield };
}
