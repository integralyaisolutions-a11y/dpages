"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCategories, type CategoryFormValues } from "@/hooks/useCategories";
import { ApiError, type CategoriaApi } from "@/lib/api";
import { CategoryFormModal } from "./CategoryFormModal";

export default function CategoriesPage() {
  const { data, isLoading, error, refetch, createCategory, editCategory, deleteCategory } = useCategories();
  const [formState, setFormState] = useState<{ mode: "create" | "edit"; category?: CategoriaApi } | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoriaApi | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSave(values: CategoryFormValues) {
    if (formState?.mode === "edit" && formState.category) {
      await editCategory(formState.category.id, values);
    } else {
      await createCategory(values);
    }
    setFormState(null);
  }

  async function handleConfirmDelete() {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCategory(categoryToDelete.id);
      setCategoryToDelete(null);
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError ? caught.message : "No s'ha pogut eliminar la categoria.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Categories de producte"
        subtitle="Manteniment de les categories, l'indicador Elaborat Porc i l'Agrupació de Rendiment."
        action={{
          label: "Nova categoria",
          icon: <Plus className="h-4 w-4" />,
          onClick: () => setFormState({ mode: "create" }),
        }}
      />

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;han pogut carregar les categories: {error.message}</p>
          <button
            type="button"
            onClick={refetch}
            className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="w-[35%] px-3 py-2 text-left font-medium text-gray-500 break-words">Categoria</th>
                <th className="w-[20%] px-3 py-2 text-left font-medium text-gray-500 break-words">Elaborat Porc</th>
                <th className="w-[25%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                  Agrupació Rendiment
                </th>
                <th className="w-[20%] px-3 py-2 text-right font-medium text-gray-500 break-words">Accions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((category) => (
                <tr key={category.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-3 break-words">
                    <span className="font-semibold text-gray-900">{category.nom}</span>
                  </td>
                  <td className="px-3 py-3 break-words text-gray-900">{category.elaboratPorc ? "Sí" : "No"}</td>
                  <td className="px-3 py-3 break-words text-gray-900">{category.agrupacioRendiment ?? "—"}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        variant="edit"
                        label="Editar categoria"
                        onClick={() => setFormState({ mode: "edit", category })}
                      />
                      <IconButton
                        variant="delete"
                        label="Suprimeix categoria"
                        onClick={() => {
                          setDeleteError(null);
                          setCategoryToDelete(category);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CategoryFormModal
        key={formState ? (formState.category?.id ?? "create") : "closed"}
        mode={formState?.mode ?? "create"}
        initialData={formState?.category}
        isOpen={formState !== null}
        onClose={() => setFormState(null)}
        onSave={handleSave}
      />

      <ConfirmDialog
        isOpen={categoryToDelete !== null}
        title="Suprimeix  categoria"
        message={
          categoryToDelete
            ? `Estàs segur que vols suprimir la categoria "${categoryToDelete.nom}"? Aquesta acció no es pot desfer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancel·lar"
        errorMessage={deleteError}
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setCategoryToDelete(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
