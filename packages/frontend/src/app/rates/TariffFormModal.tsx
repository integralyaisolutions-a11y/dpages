"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";

type FieldErrors = { codi?: string; nom?: string };

export function TariffFormModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (code: string, name: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canSave = code.trim() !== "" && name.trim() !== "";

  async function handleSave() {
    if (!canSave) return;
    setFieldErrors({});
    setFormError(null);
    setIsSaving(true);
    try {
      await onSave(code.trim(), name.trim());
      setCode("");
      setName("");
    } catch (caught) {
      if (caught instanceof ApiError) {
        const nextFieldErrors: FieldErrors = {};
        for (const detall of caught.detalls ?? []) {
          if (detall.camp === "codi" || detall.camp === "nom") {
            nextFieldErrors[detall.camp] = detall.missatge;
          }
        }
        if (Object.keys(nextFieldErrors).length > 0) {
          setFieldErrors(nextFieldErrors);
        } else {
          // 409 (codi ja existent) i qualsevol altre error sense detall de camp cauen acá.
          setFormError(caught.message);
        }
      } else {
        setFormError("No s'ha pogut crear la tarifa.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleClose() {
    setCode("");
    setName("");
    setFieldErrors({});
    setFormError(null);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nova tarifa">
      <div className="flex flex-col gap-4">
        <TextField
          label="Codi"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={fieldErrors.codi}
        />
        <TextField
          label="Nom"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.nom}
        />
        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={handleClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold ${
            canSave && !isSaving ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          {isSaving ? "Desant..." : "Desar"}
        </button>
      </div>
    </Modal>
  );
}
