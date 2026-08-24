"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { ClientTariffApi, TariffApi } from "@/lib/api";

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
  initialData?: ClientTariffApi;
  tariffColumns: TariffApi[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: ClientTariffApi) => void;
}) {
  const [code, setCode] = useState(initialData?.code ?? "");
  const [city, setCity] = useState(initialData?.city ?? "");
  const [name, setName] = useState(initialData?.name ?? "");
  const [tariffName, setTariffName] = useState(
    tariffColumns.find((tariff) => tariff.code === initialData?.tariffCode)?.name ?? NO_TARIFF,
  );
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!code.trim() || !name.trim()) {
      setError("El codi i el nom son obligatoris.");
      return;
    }
    const tariffCode = tariffColumns.find((tariff) => tariff.name === tariffName)?.code ?? null;
    onSave({ code: code.trim(), name: name.trim(), city: city.trim(), tariffCode });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === "create" ? "Nou client" : "Modificar client"}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Codi"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={error ?? undefined}
          />
          <TextField label="Població" value={city} onChange={(event) => setCity(event.target.value)} />
        </div>
        <TextField label="Nom" value={name} onChange={(event) => setName(event.target.value)} />
        <SelectFilter
          label="Tarifa"
          options={[NO_TARIFF, ...tariffColumns.map((tariff) => tariff.name)]}
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
