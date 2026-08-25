"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { ClientApi, TarifaResumApi } from "@/lib/api";

const NO_TARIFF = "Sense tarifa";

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
  onSave: (values: Omit<ClientApi, "id">) => void;
}) {
  const [codi, setCodi] = useState(initialData?.codi ?? "");
  const [poblacio, setPoblacio] = useState(initialData?.poblacio ?? "");
  const [nom, setNom] = useState(initialData?.nom ?? "");
  const [tariffName, setTariffName] = useState(initialData?.tarifa?.nom ?? NO_TARIFF);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!codi.trim() || !nom.trim()) {
      setError("El codi i el nom son obligatoris.");
      return;
    }
    const tarifa = tariffColumns.find((tariff) => tariff.nom === tariffName) ?? null;
    onSave({
      codi: codi.trim(),
      nom: nom.trim(),
      poblacio: poblacio.trim() || null,
      nif: initialData?.nif ?? null,
      email: initialData?.email ?? null,
      telefon: initialData?.telefon ?? null,
      tarifa: tarifa ? { id: tarifa.id, nom: tarifa.nom } : null,
      transportistaDefecte: initialData?.transportistaDefecte ?? null,
      actiu: initialData?.actiu ?? true,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === "create" ? "Nou client" : "Modificar client"}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Codi"
            value={codi}
            onChange={(event) => setCodi(event.target.value)}
            error={error ?? undefined}
          />
          <TextField label="Població" value={poblacio} onChange={(event) => setPoblacio(event.target.value)} />
        </div>
        <TextField label="Nom" value={nom} onChange={(event) => setNom(event.target.value)} />
        <SelectFilter
          label="Tarifa"
          options={[NO_TARIFF, ...tariffColumns.map((tariff) => tariff.nom)]}
          value={tariffName}
          onChange={setTariffName}
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
