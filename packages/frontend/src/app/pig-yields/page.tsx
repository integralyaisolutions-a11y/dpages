"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/DataTable";
import { EditableCell } from "@/components/ui/EditableCell";
import { ClearFiltersButton, FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useEditableRow } from "@/hooks/useEditableRow";
import { usePigYields, type PigYieldPatch } from "@/hooks/usePigYields";
import type { PigYieldApi } from "@/lib/api";
import { calculatePigYieldTotal } from "@/lib/pigYieldCalculations";
import { PigYieldFormModal } from "./PigYieldFormModal";

const ALL_CATEGORIES = "Totes";

function formatUnits(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function formatKg(value: number) {
  return value.toFixed(3).replace(".", ",");
}

function PigYieldRow({
  item,
  onSave,
  onDelete,
}: {
  item: PigYieldApi;
  onSave: (id: string, patch: PigYieldPatch) => void;
  onDelete: (item: PigYieldApi) => void;
}) {
  const { draft, setField, save, isDirty } = useEditableRow(
    { unitsPerPig: item.unitsPerPig, kgPerUnit: item.kgPerUnit },
    (values) => onSave(item.id, values),
  );

  return (
    <TableRow>
      <TableCell>
        <span className="font-semibold text-gray-900">{item.category}</span>
      </TableCell>
      <TableCell>{item.productionGroup}</TableCell>
      <TableCell align="right">
        <EditableCell
          value={draft.unitsPerPig}
          formatValue={formatUnits}
          step="0.01"
          onChange={(value) => setField("unitsPerPig", value ?? 0)}
        />
      </TableCell>
      <TableCell align="right">
        <EditableCell
          value={draft.kgPerUnit}
          formatValue={formatKg}
          step="0.001"
          onChange={(value) => setField("kgPerUnit", value ?? 0)}
        />
      </TableCell>
      <TableCell align="right">
        <span className="font-bold text-gray-900">
          {formatKg(calculatePigYieldTotal(draft.unitsPerPig, draft.kgPerUnit))}
        </span>
      </TableCell>
      <TableCell align="right">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={save}
            disabled={!isDirty}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              isDirty ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
            }`}
          >
            Guardar
          </button>
          <IconButton variant="delete" label="Suprimeix línia" onClick={() => onDelete(item)} />
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function PigYieldsPage() {
  const { data, isLoading, error, createPigYield, updatePigYield, deletePigYield } = usePigYields();
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pigYieldToDelete, setPigYieldToDelete] = useState<PigYieldApi | null>(null);

  const categoryOptions = useMemo(
    () => [ALL_CATEGORIES, ...Array.from(new Set(data.map((item) => item.category)))],
    [data],
  );

  const filteredData = data.filter(
    (item) => categoryFilter === ALL_CATEGORIES || item.category === categoryFilter,
  );

  return (
    <div>
      <PageHeader
        title="Rendiments Porcs"
        subtitle="Edita les cel·les i prem Guardar a la fila per confirmar els canvis."
        action={{
          label: "Nova línia",
          icon: <Plus className="h-4 w-4" />,
          onClick: () => setIsModalOpen(true),
        }}
      />

      <FilterBar>
        <SelectFilter
          label="Categoria"
          options={categoryOptions}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <ClearFiltersButton onClick={() => setCategoryFilter(ALL_CATEGORIES)} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar els rendiments.</p>}

      {!isLoading && !error && (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Categoria</TableHeaderCell>
              <TableHeaderCell>Agrupació Producció</TableHeaderCell>
              <TableHeaderCell align="right">Unitats per porc</TableHeaderCell>
              <TableHeaderCell align="right">Kg per unitat</TableHeaderCell>
              <TableHeaderCell align="right">Pes Total</TableHeaderCell>
              <TableHeaderCell align="right">Accions</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {filteredData.map((item) => (
              <PigYieldRow
                key={item.id}
                item={item}
                onSave={updatePigYield}
                onDelete={setPigYieldToDelete}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <PigYieldFormModal
        key={isModalOpen ? "open" : "closed"}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(values) => {
          createPigYield(values);
          setIsModalOpen(false);
        }}
      />

      <ConfirmDialog
        isOpen={pigYieldToDelete !== null}
        title="Suprimeix línia"
        message={
          pigYieldToDelete
            ? `Estàs segur que vols suprimir la línia "${pigYieldToDelete.category} · ${pigYieldToDelete.productionGroup}"? Aquesta acció no es pot desfer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancel·lar"
        onConfirm={() => {
          if (pigYieldToDelete) deletePigYield(pigYieldToDelete.id);
          setPigYieldToDelete(null);
        }}
        onCancel={() => setPigYieldToDelete(null)}
      />
    </div>
  );
}
