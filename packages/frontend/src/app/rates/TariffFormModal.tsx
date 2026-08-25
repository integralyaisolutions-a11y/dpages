"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";

export function TariffFormModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (code: string, name: string) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const canSave = code.trim() !== "" && name.trim() !== "";

  function handleSave() {
    if (!canSave) return;
    onSave(code.trim(), name.trim());
    setCode("");
    setName("");
  }

  function handleClose() {
    setCode("");
    setName("");
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nova tarifa">
      <div className="flex flex-col gap-4">
        <TextField label="Codi" value={code} onChange={(event) => setCode(event.target.value)} />
        <TextField label="Nom" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={handleClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold ${
            canSave ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          Desar
        </button>
      </div>
    </Modal>
  );
}
