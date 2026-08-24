"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/DataTable";
import { useCategories, type CategoryFormValues } from "@/hooks/useCategories";
import type { CategoryApi } from "@/lib/api";
import { CategoryFormModal } from "./CategoryFormModal";

export default function CategoriesPage() {
  const { data, isLoading, error, createCategory, editCategory, deleteCategory } = useCategories();
  const [formState, setFormState] = useState<{ mode: "create" | "edit"; category?: CategoryApi } | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryApi | null>(null);

  function handleSave(values: CategoryFormValues) {
    if (formState?.mode === "edit" && formState.category) {
      editCategory(formState.category.id, values);
    } else {
      createCategory(values);
    }
    setFormState(null);
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
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar les categories.</p>}

      {!isLoading && !error && (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Categoria</TableHeaderCell>
              <TableHeaderCell>Elaborat Porc</TableHeaderCell>
              <TableHeaderCell>Agrupació Rendiment</TableHeaderCell>
              <TableHeaderCell align="right">Accions</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {data.map((category) => (
              <TableRow key={category.id}>
                <TableCell>
                  <span className="font-semibold text-gray-900">{category.name}</span>
                </TableCell>
                <TableCell>{category.elaboratPorc ? "Sí" : "No"}</TableCell>
                <TableCell>{category.agrupacioRendiment ?? "—"}</TableCell>
                <TableCell align="right">
                  <div className="flex justify-end gap-1">
                    <IconButton
                      variant="edit"
                      label="Editar categoria"
                      onClick={() => setFormState({ mode: "edit", category })}
                    />
                    <IconButton
                      variant="delete"
                      label="Suprimeix categoria"
                      onClick={() => setCategoryToDelete(category)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
            ? `Estàs segur que vols suprimir la categoria "${categoryToDelete.name}"? Aquesta acció no es pot desfer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancel·lar"
        onConfirm={() => {
          if (categoryToDelete) deleteCategory(categoryToDelete.id);
          setCategoryToDelete(null);
        }}
        onCancel={() => setCategoryToDelete(null)}
      />
    </div>
  );
}
