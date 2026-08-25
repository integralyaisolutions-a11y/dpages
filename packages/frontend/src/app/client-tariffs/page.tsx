"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataCard, DataCardActions, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useRates } from "@/hooks/useRates";
import type { ClientTariffApi } from "@/lib/api";
import { ClientFormModal } from "./ClientFormModal";

const ALL_FEM = "Totes";

function ClientTariffCard({
  client,
  tariffName,
  onEdit,
}: {
  client: ClientTariffApi;
  tariffName: string | undefined;
  onEdit: () => void;
}) {
  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{client.code}</p>
      <p className="text-sm text-gray-500">{client.name}</p>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Població">{client.city}</DataCardField>
          <DataCardField label="Tarifa assignada">{tariffName ? <Badge>{tariffName}</Badge> : "—"}</DataCardField>
        </DataCardGrid>
      </div>

      <DataCardActions>
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Editar client
        </button>
      </DataCardActions>
    </DataCard>
  );
}

export default function ClientTariffsPage() {
  const { data, isLoading, error, createClient, editClient } = useClientTariffs();
  const { tariffColumns } = useRates();
  const [search, setSearch] = useState("");
  const [tariffFilter, setTariffFilter] = useState(ALL_FEM);
  const [formState, setFormState] = useState<{ mode: "create" | "edit"; client?: ClientTariffApi } | null>(null);

  const tariffFilterOptions = useMemo(() => [ALL_FEM, ...tariffColumns.map((tariff) => tariff.name)], [tariffColumns]);

  const filtered = data.filter((client) => {
    if (search) {
      const term = search.toLowerCase();
      if (!client.code.toLowerCase().includes(term) && !client.name.toLowerCase().includes(term)) return false;
    }
    if (tariffFilter !== ALL_FEM) {
      const tariffName = tariffColumns.find((tariff) => tariff.code === client.tariffCode)?.name;
      if (tariffName !== tariffFilter) return false;
    }
    return true;
  });

  function handleSave(values: ClientTariffApi) {
    if (formState?.mode === "edit" && formState.client) {
      editClient(formState.client.code, values);
    } else {
      createClient(values);
    }
    setFormState(null);
  }

  return (
    <div>
      <PageHeader
        title="Tarifes per client"
        subtitle="Assignació de tarifes als clients."
        action={{
          label: "Nou client",
          icon: <Plus className="h-4 w-4" />,
          onClick: () => setFormState({ mode: "create" }),
        }}
      />

      <FilterBar>
        <SearchInput label="Cerca client (codi o nom)" value={search} onChange={setSearch} />
        <SelectFilter label="Tarifa" options={tariffFilterOptions} value={tariffFilter} onChange={setTariffFilter} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar els clients.</p>}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {filtered.map((client) => {
              const tariffName = tariffColumns.find((tariff) => tariff.code === client.tariffCode)?.name;
              return (
                <ClientTariffCard
                  key={client.code}
                  client={client}
                  tariffName={tariffName}
                  onEdit={() => setFormState({ mode: "edit", client })}
                />
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[15%] px-2 py-2 text-left font-medium text-gray-500 break-words">Codi</th>
                  <th className="w-[28%] px-2 py-2 text-left font-medium text-gray-500 break-words">Client</th>
                  <th className="w-[20%] px-2 py-2 text-left font-medium text-gray-500 break-words">Població</th>
                  <th className="w-[22%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Tarifa assignada
                  </th>
                  <th className="w-[15%] px-2 py-2 text-right font-medium text-gray-500 break-words">Accions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const tariffName = tariffColumns.find((tariff) => tariff.code === client.tariffCode)?.name;
                  return (
                    <tr key={client.code} className="border-b border-gray-100 last:border-0">
                      <td className="px-2 py-3 break-words">
                        <span className="font-semibold text-gray-900">{client.code}</span>
                      </td>
                      <td className="px-2 py-3 break-words text-gray-900">{client.name}</td>
                      <td className="px-2 py-3 break-words text-gray-900">{client.city}</td>
                      <td className="px-2 py-3 break-words">{tariffName ? <Badge>{tariffName}</Badge> : "—"}</td>
                      <td className="px-2 py-3 text-right">
                        <div className="flex justify-end">
                          <IconButton
                            variant="edit"
                            label="Editar client"
                            onClick={() => setFormState({ mode: "edit", client })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ClientFormModal
        key={formState ? (formState.client?.code ?? "create") : "closed"}
        mode={formState?.mode ?? "create"}
        initialData={formState?.client}
        tariffColumns={tariffColumns}
        isOpen={formState !== null}
        onClose={() => setFormState(null)}
        onSave={handleSave}
      />
    </div>
  );
}
