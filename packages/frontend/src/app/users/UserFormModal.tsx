"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/hooks/useAuth";
import type { CreateUserInput, EditUserInput } from "@/hooks/useUsers";
import { ApiError, type RolApi, type UsuariApi, type UsuariCreatRespostaApi } from "@/lib/api";

function roleLabel(role: RolApi) {
  return role.nom;
}

type FieldErrors = { nom?: string; email?: string; rolId?: string };

export function UserFormModal({
  mode,
  initialData,
  isOpen,
  onClose,
  roles,
  onCreate,
  onEdit,
  onCreated,
}: {
  mode: "create" | "edit";
  initialData?: UsuariApi;
  isOpen: boolean;
  onClose: () => void;
  roles: RolApi[];
  onCreate: (input: CreateUserInput) => Promise<UsuariCreatRespostaApi>;
  onEdit: (id: number, input: EditUserInput) => Promise<UsuariApi>;
  /** Dispara el diàleg persistent amb linkEstabliment — viu al pare, no acá. */
  onCreated: (resposta: UsuariCreatRespostaApi) => void;
}) {
  const { user: currentUser } = useAuth();
  const [nom, setNom] = useState(initialData?.nom ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [rolId, setRolId] = useState<number | null>(initialData?.rol.id ?? null);
  const [actiu, setActiu] = useState(initialData?.actiu ?? true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRoleConfirm, setPendingRoleConfirm] = useState(false);
  const nomInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    nomInputRef.current?.focus();
  }, [isOpen]);

  const selectedRole = roles.find((r) => r.id === rolId) ?? null;
  const roleChanged = mode === "edit" && rolId !== (initialData?.rol.id ?? null);
  const grantsUsersModule = selectedRole?.modulsPermesos.includes("usuaris") ?? false;
  const isSelfRoleChange = mode === "edit" && roleChanged && currentUser?.id === initialData?.id;
  // Fricció extra pròpia del frontend — avui PATCH /usuaris/:id no té cap
  // guard real al backend (hallazgo de seguretat ja reportat a Gerardo),
  // aquest ConfirmDialog és l'única barrera mentre tant.
  const needsRoleConfirmation = (mode === "create" || roleChanged) && (grantsUsersModule || isSelfRoleChange);

  const canSave = nom.trim() !== "" && email.trim() !== "" && rolId !== null;

  async function doSave() {
    if (!canSave || rolId === null) return;
    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      if (mode === "create") {
        const resposta = await onCreate({ nom: nom.trim(), email: email.trim(), rolId });
        onCreated(resposta);
      } else if (initialData) {
        await onEdit(initialData.id, { nom: nom.trim(), rolId, actiu });
      }
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.codi === "CONFLICTE") {
          setFieldErrors({ email: caught.message });
        } else {
          const next: FieldErrors = {};
          for (const detall of caught.detalls ?? []) {
            if (detall.camp === "nom" || detall.camp === "email" || detall.camp === "rolId") {
              next[detall.camp] = detall.missatge;
            }
          }
          if (Object.keys(next).length > 0) setFieldErrors(next);
          else setFormError(caught.message);
        }
      } else {
        setFormError("Error desconegut.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveClick() {
    if (!canSave) {
      setFieldErrors({
        nom: nom.trim() === "" ? "El nom no pot estar buit." : undefined,
        email: email.trim() === "" ? "L'email no pot estar buit." : undefined,
        rolId: rolId === null ? "Cal seleccionar un rol." : undefined,
      });
      return;
    }
    if (needsRoleConfirmation) {
      setPendingRoleConfirm(true);
      return;
    }
    void doSave();
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={mode === "create" ? "Nou usuari" : "Modificar usuari"}>
        <div className="flex flex-col gap-4">
          <TextField
            ref={nomInputRef}
            label="Nom"
            value={nom}
            onChange={(event) => setNom(event.target.value)}
            error={fieldErrors.nom}
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            disabled={mode === "edit"}
          />
          <div>
            <SelectFilter
              label="Rol"
              options={roles.map(roleLabel)}
              value={selectedRole ? roleLabel(selectedRole) : ""}
              onChange={(label) => {
                const found = roles.find((r) => roleLabel(r) === label);
                setRolId(found?.id ?? null);
              }}
            />
            {fieldErrors.rolId && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.rolId}</p>}
          </div>
          {mode === "edit" && (
            <SelectFilter
              label="Estat"
              options={["Actiu", "Inactiu"]}
              value={actiu ? "Actiu" : "Inactiu"}
              onChange={(value) => setActiu(value === "Actiu")}
            />
          )}
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
        isOpen={pendingRoleConfirm}
        title="Confirmar canvi de rol"
        message={
          isSelfRoleChange
            ? 'Estàs a punt de canviar el TEU propi rol. Si et treus el mòdul "usuaris", pots perdre accés a aquesta pantalla. Vols continuar?'
            : 'El rol seleccionat inclou el mòdul "usuaris" (gestió d\'usuaris i rols). Avui el backend no bloqueja aquesta acció per rol — ets tu qui confirma que és intencional. Vols continuar?'
        }
        confirmLabel="Confirmar"
        cancelLabel="Cancel·lar"
        onConfirm={() => {
          setPendingRoleConfirm(false);
          void doSave();
        }}
        onCancel={() => setPendingRoleConfirm(false)}
      />
    </>
  );
}
