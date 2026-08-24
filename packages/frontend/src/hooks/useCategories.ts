"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryApi } from "@/lib/api";
import { addMockCategory, getMockCategories, removeMockCategory, updateMockCategory } from "@/mocks/categories";

export type CategoryFormValues = Pick<CategoryApi, "name" | "elaboratPorc" | "agrupacioRendiment">;

type UseCategoriesResult = {
  data: CategoryApi[];
  isLoading: boolean;
  error: Error | null;
  createCategory: (values: CategoryFormValues) => void;
  editCategory: (id: string, values: CategoryFormValues) => void;
  deleteCategory: (id: string) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockCategories()
// por api.get<CategoryApi[]>("/categories") sin tocar la forma del hook.
export function useCategories(): UseCategoriesResult {
  const [data, setData] = useState<CategoryApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockCategories()
      .then((categories) => {
        if (!cancelled) setData(categories);
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

  // TODO: sustituir por mutation real (POST /categories) cuando exista backend.
  const createCategory = useCallback((values: CategoryFormValues) => {
    console.log("create category", values);
    addMockCategory({ id: crypto.randomUUID(), ...values }).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /categories/:id) cuando exista backend.
  const editCategory = useCallback((id: string, values: CategoryFormValues) => {
    console.log("edit category", id, values);
    updateMockCategory(id, { id, ...values }).then(setData);
  }, []);

  // TODO: sustituir por mutation real (DELETE /categories/:id) contra el backend.
  const deleteCategory = useCallback((id: string) => {
    console.log("delete category", id);
    removeMockCategory(id).then(setData);
  }, []);

  return { data, isLoading, error, createCategory, editCategory, deleteCategory };
}
