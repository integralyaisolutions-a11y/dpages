"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";
import { useModulsValids } from "@/hooks/useModulsValids";
import type { CreateRoleInput, EditRoleInput } from "@/hooks/useRols";
import { ApiError, type RolApi } from "@/lib/api";
import { MODUL_LABELS } from "@/lib/roles";

type FieldErrors = { nom?: string };

const SENSITIVE_MODULES = ["usuaris", "rols"];

export function RoleFormModal({
  mode,
  initialData,
  isOpen,
  onClose,
  onCreate,
  onEdit,
}: {
  mode: "create" | "edit";
  initialData?: RolApi;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: CreateRoleInput) => Promise<RolApi>;
  onEdit: (id: number, input: EditRoleInput) => Promise<RolApi>;
}) {
  const { data: modulsValids, isLoading: modulsLoading, error: modulsError } = useModulsValids();
  const [nom, setNom] = useState(initialData?.nom ?? "");
  const [modulsPermesos, setModulsPermesos] = useState<string[]>(initialData?.modulsPermesos ?? []);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSensitiveConfirm, setPendingSensitiveConfirm] = useState(false);
  const nomInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    nomInputRef.current?.focus();
  }, [isOpen]);

  function toggleModul(modul: string) {
    setModulsPermesos((current) => (current.includes(modul) ? current.filter((m) => m !== modul) : [...current, modul]));
  }

  // Fricció extra pròpia del frontend (sense guard real al backend encara,
  // ver informe de seguretat): agregar "usuaris" o "rols" a un rol el
  // converteix en un rol de gestió — es confirma explícit abans de desar.
  const hasSensitiveModule = SENSITIVE_MODULES.some((modul) => modulsPermesos.includes(modul));
  const canSave = nom.trim() !== "";

  async function doSave() {
    if (!canSave) return;
    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      if (mode === "create") {
        await onCreate({ nom: nom.trim(), modulsPermesos });
      } else if (initialData) {
        await onEdit(initialData.id, { nom: nom.trim(), modulsPermesos });
      }
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const next: FieldErrors = {};
        for (const detall of caught.detalls ?? []) {
          if (detall.camp === "nom") next.nom = detall.missatge;
        }
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setFormError(caught.message);
      } else {
        setFormError("Error desconegut.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveClick() {
    if (!canSave) {
      setFieldErrors({ nom: "El nom no pot estar buit." });
      return;
    }
    if (hasSensitiveModule) {
      setPendingSensitiveConfirm(true);
      return;
    }
    void doSave();
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={mode === "create" ? "Nou rol" : "Modificar rol"}>
        <div className="flex flex-col gap-4">
          <TextField
            ref={nomInputRef}
            label="Nom"
            value={nom}
            onChange={(event) => setNom(event.target.value)}
            error={fieldErrors.nom}
          />
          <div>
            <span className="text-sm font-medium text-gray-900">Mòduls permesos</span>
            {modulsLoading && <p className="mt-2 text-sm text-gray-500">Carregant mòduls...</p>}
            {modulsError && (
              <p className="mt-2 text-sm text-red-600">
                No s&apos;han pogut carregar els mòduls disponibles: {modulsError.message}
              </p>
            )}
            {!modulsLoading && !modulsError && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {modulsValids.map((modul) => (
                  <label key={modul} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={modulsPermesos.includes(modul)}
                      onChange={() => toggleModul(modul)}
                      className="h-4 w-4 rounded border-gray-300 text-ink"
                    />
                    {MODUL_LABELS[modul] ?? modul}
                  </label>
                ))}
              </div>
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
            onClick={handleSaveClick}
            disabled={isSaving}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Desant..." : "Desar"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={pendingSensitiveConfirm}
        title="Confirmar mòduls sensibles"
        message='Aquest rol inclou "Usuaris" i/o "Rols" — qui el tingui assignat podrà gestionar usuaris i rols del sistema. Avui el backend no bloqueja aquesta acció, ets tu qui confirma que és intencional. Vols continuar?'
        confirmLabel="Confirmar"
        cancelLabel="Cancel·lar"
        onConfirm={() => {
          setPendingSensitiveConfirm(false);
          void doSave();
        }}
        onCancel={() => setPendingSensitiveConfirm(false)}
      />
    </>
  );
}
