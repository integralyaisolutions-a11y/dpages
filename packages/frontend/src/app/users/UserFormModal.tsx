"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { UserFormValues } from "@/hooks/useUsers";
import type { UserApi, UserRole } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/roles";

const ROLE_OPTIONS: UserRole[] = ["office", "workshop", "packaging", "production"];
const ROLE_LABEL_OPTIONS = ROLE_OPTIONS.map((role) => ROLE_LABELS[role]);
const STATUS_OPTIONS = ["Actiu", "Inactiu"];

export function UserFormModal({
  mode,
  initialData,
  isOpen,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  initialData?: UserApi;
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: UserFormValues) => void;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [role, setRole] = useState<UserRole>(initialData?.role ?? "office");
  const [status, setStatus] = useState<UserApi["status"]>(initialData?.status ?? "active");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    nameInputRef.current?.focus();
  }, [isOpen]);

  function handleSave() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const nextErrors: typeof errors = {};
    if (!trimmedName) nextErrors.name = "El nom no pot estar buit.";
    if (!trimmedEmail) nextErrors.email = "L'email no pot estar buit.";
    if (mode === "create" && !password.trim()) nextErrors.password = "La contrasenya és obligatòria.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSave({ name: trimmedName, email: trimmedEmail, role, status, password });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === "create" ? "Nou usuari" : "Modificar usuari"}>
      <div className="flex flex-col gap-4">
        <TextField
          ref={nameInputRef}
          label="Nom"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <SelectFilter
          label="Rol"
          options={ROLE_LABEL_OPTIONS}
          value={ROLE_LABELS[role]}
          onChange={(label) => {
            const found = ROLE_OPTIONS.find((option) => ROLE_LABELS[option] === label);
            if (found) setRole(found);
          }}
        />
        <SelectFilter
          label="Estat"
          options={STATUS_OPTIONS}
          value={status === "active" ? "Actiu" : "Inactiu"}
          onChange={(value) => setStatus(value === "Actiu" ? "active" : "inactive")}
        />
        <TextField
          label="Contrasenya"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={mode === "edit" ? "Deixa en blanc per mantenir l'actual" : undefined}
          error={errors.password}
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
