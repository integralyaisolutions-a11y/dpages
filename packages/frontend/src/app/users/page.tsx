"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useUsers, type UserFormValues } from "@/hooks/useUsers";
import type { UserApi } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/roles";
import { UserFormModal } from "./UserFormModal";

const ALL = "Tots";
const ROLE_OPTIONS = [ALL, ...Object.values(ROLE_LABELS)];
const STATUS_OPTIONS = [ALL, "Actiu", "Inactiu"];

const NOM_WIDTH = 18;
const EMAIL_WIDTH = 22;
const ROL_WIDTH = 24;
const ESTAT_WIDTH = 16;
const ACCIONS_WIDTH = 20;

export default function UsersPage() {
  const { data, isLoading, error, createUser, editUser, deleteUser } = useUsers();
  const [formState, setFormState] = useState<{ mode: "create" | "edit"; user?: UserApi } | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserApi | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const filtered = data.filter((user) => {
    if (search) {
      const query = search.toLowerCase();
      if (!user.name.toLowerCase().includes(query) && !user.email.toLowerCase().includes(query)) return false;
    }
    if (roleFilter !== ALL && ROLE_LABELS[user.role] !== roleFilter) return false;
    if (statusFilter !== ALL) {
      const wantsActive = statusFilter === "Actiu";
      if ((user.status === "active") !== wantsActive) return false;
    }
    return true;
  });

  function handleSave(values: UserFormValues) {
    if (formState?.mode === "edit" && formState.user) {
      editUser(formState.user.id, values);
    } else {
      createUser(values);
    }
    setFormState(null);
  }

  return (
    <div>
      <PageHeader
        title="Administració d'usuaris"
        subtitle="Gestió d'usuaris i rols del sistema."
        action={{
          label: "Nou usuari",
          icon: <Plus className="h-4 w-4" />,
          onClick: () => setFormState({ mode: "create" }),
        }}
      />

      <FilterBar>
        <SearchInput label="Cerca" placeholder="Nom o email..." value={search} onChange={setSearch} />
        <SelectFilter label="Rol" options={ROLE_OPTIONS} value={roleFilter} onChange={setRoleFilter} />
        <SelectFilter label="Estat" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar els usuaris.</p>}

      {!isLoading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 break-words" style={{ width: `${NOM_WIDTH}%` }}>
                  Nom
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 break-words" style={{ width: `${EMAIL_WIDTH}%` }}>
                  Email
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 break-words" style={{ width: `${ROL_WIDTH}%` }}>
                  Rol
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 break-words" style={{ width: `${ESTAT_WIDTH}%` }}>
                  Estat
                </th>
                <th
                  className="px-3 py-2 text-right font-medium text-gray-500 break-words"
                  style={{ width: `${ACCIONS_WIDTH}%` }}
                >
                  Accions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-3 break-words">
                    <span className="font-semibold text-gray-900">{user.name}</span>
                  </td>
                  <td className="px-3 py-3 break-words text-gray-900">{user.email}</td>
                  <td className="px-3 py-3 break-words">
                    <Badge variant="info">{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="px-3 py-3 break-words">
                    <Badge variant={user.status === "active" ? "positive" : "negative"}>
                      {user.status === "active" ? "Actiu" : "Inactiu"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        variant="edit"
                        label="Editar usuari"
                        onClick={() => setFormState({ mode: "edit", user })}
                      />
                      <IconButton variant="delete" label="Suprimeix usuari" onClick={() => setUserToDelete(user)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserFormModal
        key={formState ? (formState.user?.id ?? "create") : "closed"}
        mode={formState?.mode ?? "create"}
        initialData={formState?.user}
        isOpen={formState !== null}
        onClose={() => setFormState(null)}
        onSave={handleSave}
      />

      <ConfirmDialog
        isOpen={userToDelete !== null}
        title="Suprimeix usuari"
        message={
          userToDelete
            ? `Estàs segur que vols suprimir l'usuari "${userToDelete.name}"? Aquesta acció no es pot desfer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancel·lar"
        onConfirm={() => {
          if (userToDelete) deleteUser(userToDelete.id);
          setUserToDelete(null);
        }}
        onCancel={() => setUserToDelete(null)}
      />
    </div>
  );
}
