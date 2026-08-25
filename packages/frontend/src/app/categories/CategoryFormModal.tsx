"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { CategoryFormValues } from "@/hooks/useCategories";
import type { CategoriaApi } from "@/lib/api";

const ELABORAT_PORC_OPTIONS = ["Sí", "No"];
const AGRUPACIO_RENDIMENT_OPTIONS = ["— Cap —", "MAGRE", "KG", "PAQ"];
type AgrupacioRendiment = CategoriaApi["agrupacioRendiment"];

export function CategoryFormModal({
  mode,
  initialData,
  isOpen,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  initialData?: CategoryFormValues;
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: CategoryFormValues) => void;
}) {
  const [name, setName] = useState(initialData?.nom ?? "");
  const [elaboratPorc, setElaboratPorc] = useState(initialData?.elaboratPorc ?? false);
  const [agrupacioRendiment, setAgrupacioRendiment] = useState<AgrupacioRendiment>(
    initialData?.agrupacioRendiment ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || mode !== "edit") return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isOpen, mode]);

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("La categoria no pot estar buida.");
      return;
    }
    onSave({ nom: trimmedName, elaboratPorc, agrupacioRendiment });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === "create" ? "Nova categoria" : "Modificar categoria"}>
      <div className="flex flex-col gap-4">
        <TextField
          ref={nameInputRef}
          label="Categoria"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={error ?? undefined}
        />
        <SelectFilter
          label="Elaborat Porc"
          options={ELABORAT_PORC_OPTIONS}
          value={elaboratPorc ? "Sí" : "No"}
          onChange={(value) => setElaboratPorc(value === "Sí")}
        />
        <SelectFilter
          label="Agrupació Rendiment"
          options={AGRUPACIO_RENDIMENT_OPTIONS}
          value={agrupacioRendiment ?? "— Cap —"}
          onChange={(value) => setAgrupacioRendiment(value === "— Cap —" ? null : (value as AgrupacioRendiment))}
        />
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Desar
        </button>
      </div>
    </Modal>
  );
}
