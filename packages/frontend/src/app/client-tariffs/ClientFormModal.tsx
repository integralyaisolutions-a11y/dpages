"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { ClientFormValues } from "@/hooks/useClientTariffs";
import { ApiError, type ClientApi, type TarifaResumApi } from "@/lib/api";

const NO_TARIFF = "Sense tarifa";

// codi ya no es editable acá (ver TODO abajo), así que un error de ese
// campo no tiene dónde mostrarse junto al input — cae al mensaje genérico.
type FieldErrors = { nom?: string; poblacio?: string; tarifaId?: string };

/**
 * TODO(codi-client-auto): temporal, SOLO hasta que Gerardo entregue la
 * generación automática de `codi` en el backend (ticket ya enviado, sin
 * implementar todavía). `POST /clients` sigue exigiendo `codi` no vacío
 * (confirmado en la sesión anterior) — mientras el backend no lo genere
 * él mismo, se manda este valor temporal para no romper el contrato.
 * BORRAR esta función y dejar de mandar `codi` en el alta en cuanto el
 * backend lo autogenere.
 */
function generarCodiTemporal(): string {
  return `TMP-${Date.now().toString(36).toUpperCase()}`;
}

export function ClientFormModal({
  mode,
  initialData,
  tariffColumns,
  isOpen,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  initialData?: ClientApi;
  tariffColumns: TarifaResumApi[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: ClientFormValues) => Promise<void>;
}) {
  // Generado una sola vez por apertura del modal (el padre remonta con
  // key="create" cada vez) para que el valor mostrado sea el mismo que se manda al guardar.
  const [codiTemporal] = useState(() => (mode === "create" ? generarCodiTemporal() : null));
  const [poblacio, setPoblacio] = useState(initialData?.poblacio ?? "");
  const [nom, setNom] = useState(initialData?.nom ?? "");
  const [tariffName, setTariffName] = useState(initialData?.tarifa?.nom ?? NO_TARIFF);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canSave = nom.trim() !== "" && poblacio.trim() !== "";

  async function handleSave() {
    if (!canSave) return;
    const tarifa = tariffColumns.find((tariff) => tariff.nom === tariffName) ?? null;
    setFieldErrors({});
    setFormError(null);
    setIsSaving(true);
    try {
      await onSave({
        // Alta: mismo codi temporal ya mostrado en el modal (ver TODO
        // arriba). Edición: se manda igual al que ya tenía — no editable
        // desde este formulario.
        codi: mode === "create" ? codiTemporal : (initialData?.codi ?? null),
        nom: nom.trim(),
        poblacio: poblacio.trim(),
        tarifaId: tarifa?.id ?? null,
        nif: initialData?.nif ?? null,
        email: initialData?.email ?? null,
        telefon: initialData?.telefon ?? null,
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const nextFieldErrors: FieldErrors = {};
        for (const detall of caught.detalls ?? []) {
          if (detall.camp === "nom" || detall.camp === "poblacio" || detall.camp === "tarifaId") {
            nextFieldErrors[detall.camp] = detall.missatge;
          }
        }
        if (Object.keys(nextFieldErrors).length > 0) {
          setFieldErrors(nextFieldErrors);
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError("No s'ha pogut desar el client.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === "create" ? "Nou client" : "Modificar client"}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">Codi</span>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500">
              {mode === "create" ? codiTemporal : (initialData?.codi ?? "—")}
            </span>
          </div>
          <TextField
            label="Població"
            value={poblacio}
            onChange={(event) => setPoblacio(event.target.value)}
            error={fieldErrors.poblacio}
          />
        </div>
        <TextField label="Nom" value={nom} onChange={(event) => setNom(event.target.value)} error={fieldErrors.nom} />
        <div>
          <SelectFilter
            label="Tarifa"
            options={[NO_TARIFF, ...tariffColumns.map((tariff) => tariff.nom)]}
            value={tariffName}
            onChange={setTariffName}
          />
          {fieldErrors.tarifaId && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.tarifaId}</p>}
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
