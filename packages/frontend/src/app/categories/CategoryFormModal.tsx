"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { CategoryFormValues } from "@/hooks/useCategories";
import { ApiError, type CategoriaApi } from "@/lib/api";

const ELABORAT_PORC_OPTIONS = ["Sí", "No"];
const AGRUPACIO_RENDIMENT_OPTIONS = ["— Cap —", "MAGRE", "KG", "PAQ"];
type AgrupacioRendiment = CategoriaApi["agrupacioRendiment"];

type FieldErrors = { nom?: string; agrupacioRendiment?: string };

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
  onSave: (values: CategoryFormValues) => Promise<void>;
}) {
  const [name, setName] = useState(initialData?.nom ?? "");
  const [elaboratPorc, setElaboratPorc] = useState(initialData?.elaboratPorc ?? false);
  const [agrupacioRendiment, setAgrupacioRendiment] = useState<AgrupacioRendiment>(
    initialData?.agrupacioRendiment ?? null,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || mode !== "edit") return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isOpen, mode]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFieldErrors({ nom: "La categoria no pot estar buida." });
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setIsSaving(true);
    try {
      await onSave({ nom: trimmedName, elaboratPorc, agrupacioRendiment });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const nextFieldErrors: FieldErrors = {};
        for (const detall of caught.detalls ?? []) {
          if (detall.camp === "nom" || detall.camp === "agrupacioRendiment") {
            nextFieldErrors[detall.camp] = detall.missatge;
          }
        }
        if (Object.keys(nextFieldErrors).length > 0) {
          setFieldErrors(nextFieldErrors);
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError("No s'ha pogut desar la categoria.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === "create" ? "Nova categoria" : "Modificar categoria"}>
      <div className="flex flex-col gap-4">
        <TextField
          ref={nameInputRef}
          label="Categoria"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.nom}
        />
        <SelectFilter
          label="Elaborat Porc"
          options={ELABORAT_PORC_OPTIONS}
          value={elaboratPorc ? "Sí" : "No"}
          onChange={(value) => {
            const next = value === "Sí";
            setElaboratPorc(next);
            // El backend rebutja agrupacioRendiment quan elaboratPorc és
            // false (contrato §4.1) — es reseteja acá per no arrossegar una
            // combinació invàlida sense que l'usuari se n'adoni.
            if (!next) setAgrupacioRendiment(null);
          }}
        />
        <div>
          <SelectFilter
            label="Agrupació Rendiment"
            options={AGRUPACIO_RENDIMENT_OPTIONS}
            value={agrupacioRendiment ?? "— Cap —"}
            onChange={(value) => setAgrupacioRendiment(value === "— Cap —" ? null : (value as AgrupacioRendiment))}
          />
          {fieldErrors.agrupacioRendiment && (
            <p className="mt-1.5 text-xs text-red-600">{fieldErrors.agrupacioRendiment}</p>
          )}
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Desant..." : "Desar"}
        </button>
      </div>
    </Modal>
  );
}
