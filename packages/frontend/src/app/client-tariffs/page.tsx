"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/DataTable";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useRates } from "@/hooks/useRates";
import type { ClientTariffApi } from "@/lib/api";
import { ClientFormModal } from "./ClientFormModal";

const ALL_FEM = "Totes";

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
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Codi</TableHeaderCell>
              <TableHeaderCell>Client</TableHeaderCell>
              <TableHeaderCell>Població</TableHeaderCell>
              <TableHeaderCell>Tarifa assignada</TableHeaderCell>
              <TableHeaderCell align="right">Accions</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {filtered.map((client) => {
              const tariffName = tariffColumns.find((tariff) => tariff.code === client.tariffCode)?.name;
              return (
                <TableRow key={client.code}>
                  <TableCell>
                    <span className="font-semibold text-gray-900">{client.code}</span>
                  </TableCell>
                  <TableCell>{client.name}</TableCell>
                  <TableCell>{client.city}</TableCell>
                  <TableCell>{tariffName ? <Badge>{tariffName}</Badge> : "—"}</TableCell>
                  <TableCell align="right">
                    <div className="flex justify-end">
                      <IconButton
                        variant="edit"
                        label="Editar client"
                        onClick={() => setFormState({ mode: "edit", client })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
