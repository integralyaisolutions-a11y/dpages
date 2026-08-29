"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataCard, DataCardActions } from "@/components/ui/DataCard";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useRols } from "@/hooks/useRols";
import { useUsers } from "@/hooks/useUsers";
import type { RolApi, UsuariApi, UsuariCreatRespostaApi } from "@/lib/api";
import { MODUL_LABELS } from "@/lib/roles";
import { LinkEstablimentDialog } from "./LinkEstablimentDialog";
import { RoleFormModal } from "./RoleFormModal";
import { UserFormModal } from "./UserFormModal";

const ALL = "Tots";
const STATUS_OPTIONS = [ALL, "Actiu", "Inactiu"];

type Tab = "usuaris" | "rols";

function UserCard({ user, onEdit }: { user: UsuariApi; onEdit: () => void }) {
  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{user.nom}</p>
      <p className="text-sm break-words text-gray-500">{user.email}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="info">{user.rol.nom}</Badge>
        <Badge variant={user.actiu ? "positive" : "negative"}>{user.actiu ? "Actiu" : "Inactiu"}</Badge>
      </div>
      <DataCardActions>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Editar usuari
        </button>
      </DataCardActions>
    </DataCard>
  );
}

function RoleCard({ role, onEdit }: { role: RolApi; onEdit: () => void }) {
  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{role.nom}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {role.modulsPermesos.length === 0 && <span className="text-sm text-gray-400">Sense mòduls</span>}
        {role.modulsPermesos.map((modul) => (
          <Badge key={modul} variant="neutral">
            {MODUL_LABELS[modul] ?? modul}
          </Badge>
        ))}
      </div>
      <DataCardActions>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Editar rol
        </button>
      </DataCardActions>
    </DataCard>
  );
}

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>("usuaris");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);

  // Únic filtre real de GET /usuaris confirmat (contrato §4.12) — la cerca
  // per nom/email és client-side sobre el llistat complet, mateix criteri
  // que Categories/Tarifes amb volums petits (~10 persones).
  const userFilters = useMemo(
    () => (statusFilter === ALL ? {} : { actiu: statusFilter === "Actiu" }),
    [statusFilter],
  );

  const { data: users, isLoading: usersLoading, error: usersError, createUser, editUser } = useUsers(userFilters);
  const { data: roles, isLoading: rolesLoading, error: rolesError, createRole, editRole } = useRols();

  const [userFormState, setUserFormState] = useState<{ mode: "create" | "edit"; user?: UsuariApi } | null>(null);
  const [roleFormState, setRoleFormState] = useState<{ mode: "create" | "edit"; role?: RolApi } | null>(null);
  const [createdUser, setCreatedUser] = useState<UsuariCreatRespostaApi | null>(null);

  const filteredUsers = users.filter((user) => {
    if (!search) return true;
    const query = search.toLowerCase();
    return user.nom.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
  });

  return (
    <div>
      <PageHeader
        title="Administració d'usuaris"
        subtitle="Gestió d'usuaris i rols del sistema."
        action={
          tab === "usuaris"
            ? { label: "Nou usuari", icon: <Plus className="h-4 w-4" />, onClick: () => setUserFormState({ mode: "create" }) }
            : { label: "Nou rol", icon: <Plus className="h-4 w-4" />, onClick: () => setRoleFormState({ mode: "create" }) }
        }
      />

      <div className="mb-6 flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("usuaris")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${
            tab === "usuaris" ? "border-ink text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Usuaris
        </button>
        <button
          type="button"
          onClick={() => setTab("rols")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${
            tab === "rols" ? "border-ink text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Rols
        </button>
      </div>

      {tab === "usuaris" && (
        <>
          <FilterBar>
            <SearchInput label="Cerca" placeholder="Nom o email..." value={search} onChange={setSearch} />
            <SelectFilter label="Estat" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
          </FilterBar>

          {usersLoading && <p className="text-sm text-gray-500">Carregant...</p>}
          {usersError && <p className="text-sm text-red-600">No s&apos;han pogut carregar els usuaris: {usersError.message}</p>}

          {!usersLoading && !usersError && (
            <>
              <div className="flex flex-col gap-3 xl:hidden">
                {filteredUsers.map((user) => (
                  <UserCard key={user.id} user={user} onEdit={() => setUserFormState({ mode: "edit", user })} />
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
                <table className="w-full table-fixed text-sm">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="w-[22%] px-3 py-2 text-left font-medium text-gray-500 break-words">Nom</th>
                      <th className="w-[28%] px-3 py-2 text-left font-medium text-gray-500 break-words">Email</th>
                      <th className="w-[22%] px-3 py-2 text-left font-medium text-gray-500 break-words">Rol</th>
                      <th className="w-[16%] px-3 py-2 text-left font-medium text-gray-500 break-words">Estat</th>
                      <th className="w-[12%] px-3 py-2 text-right font-medium text-gray-500 break-words">Accions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-3 break-words">
                          <span className="font-semibold text-gray-900">{user.nom}</span>
                        </td>
                        <td className="px-3 py-3 break-words text-gray-900">{user.email}</td>
                        <td className="px-3 py-3 break-words">
                          <Badge variant="info">{user.rol.nom}</Badge>
                        </td>
                        <td className="px-3 py-3 break-words">
                          <Badge variant={user.actiu ? "positive" : "negative"}>{user.actiu ? "Actiu" : "Inactiu"}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end">
                            <IconButton
                              variant="edit"
                              label="Editar usuari"
                              onClick={() => setUserFormState({ mode: "edit", user })}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === "rols" && (
        <>
          {rolesLoading && <p className="text-sm text-gray-500">Carregant...</p>}
          {rolesError && <p className="text-sm text-red-600">No s&apos;han pogut carregar els rols: {rolesError.message}</p>}

          {!rolesLoading && !rolesError && (
            <>
              <div className="flex flex-col gap-3 xl:hidden">
                {roles.map((role) => (
                  <RoleCard key={role.id} role={role} onEdit={() => setRoleFormState({ mode: "edit", role })} />
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
                <table className="w-full table-fixed text-sm">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="w-[20%] px-3 py-2 text-left font-medium text-gray-500 break-words">Nom</th>
                      <th className="w-[68%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                        Mòduls permesos
                      </th>
                      <th className="w-[12%] px-3 py-2 text-right font-medium text-gray-500 break-words">Accions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => (
                      <tr key={role.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-3 break-words">
                          <span className="font-semibold text-gray-900">{role.nom}</span>
                        </td>
                        <td className="px-3 py-3 break-words">
                          <div className="flex flex-wrap gap-1.5">
                            {role.modulsPermesos.length === 0 && (
                              <span className="text-sm text-gray-400">Sense mòduls</span>
                            )}
                            {role.modulsPermesos.map((modul) => (
                              <Badge key={modul} variant="neutral">
                                {MODUL_LABELS[modul] ?? modul}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end">
                            <IconButton
                              variant="edit"
                              label="Editar rol"
                              onClick={() => setRoleFormState({ mode: "edit", role })}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <UserFormModal
        key={`user-${userFormState ? (userFormState.user?.id ?? "create") : "closed"}`}
        mode={userFormState?.mode ?? "create"}
        initialData={userFormState?.user}
        isOpen={userFormState !== null}
        onClose={() => setUserFormState(null)}
        roles={roles}
        onCreate={createUser}
        onEdit={editUser}
        onCreated={(resposta) => setCreatedUser(resposta)}
      />

      <RoleFormModal
        key={`role-${roleFormState ? (roleFormState.role?.id ?? "create") : "closed"}`}
        mode={roleFormState?.mode ?? "create"}
        initialData={roleFormState?.role}
        isOpen={roleFormState !== null}
        onClose={() => setRoleFormState(null)}
        onCreate={createRole}
        onEdit={editRole}
      />

      {createdUser && (
        <LinkEstablimentDialog
          isOpen
          nom={createdUser.usuari.nom}
          email={createdUser.usuari.email}
          link={createdUser.linkEstabliment}
          onClose={() => setCreatedUser(null)}
        />
      )}
    </div>
  );
}
