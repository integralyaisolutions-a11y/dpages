"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataCard, DataCardActions, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { EditableCell } from "@/components/ui/EditableCell";
import { ClearFiltersButton, FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useEditableRow } from "@/hooks/useEditableRow";
import { usePigYields, type PigYieldPatch } from "@/hooks/usePigYields";
import type { RendimentPorcApi } from "@/lib/api";
import { parseDecimalInput } from "@/lib/decimals";
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
  item: RendimentPorcApi;
  onSave: (id: number, patch: PigYieldPatch) => void;
  onDelete: (item: RendimentPorcApi) => void;
}) {
  const { draft, setField, save, isDirty } = useEditableRow(
    { unitsPerPig: Number(item.unitatsPerPorc), kgPerUnit: Number(item.kgPerUnitat) },
    (values) =>
      onSave(item.id, {
        unitatsPerPorc: parseDecimalInput(values.unitsPerPig, 2),
        kgPerUnitat: parseDecimalInput(values.kgPerUnit, 3),
      }),
  );

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-2 py-3 break-words">
        <span className="font-semibold text-gray-900">{item.categoria}</span>
      </td>
      <td className="px-2 py-3 break-words text-gray-900">{item.agrupacioProduccio ?? "—"}</td>
      <td className="px-2 py-3 text-right">
        <EditableCell
          value={draft.unitsPerPig}
          formatValue={formatUnits}
          step="0.01"
          onChange={(value) => setField("unitsPerPig", value ?? 0)}
        />
      </td>
      <td className="px-2 py-3 text-right">
        <EditableCell
          value={draft.kgPerUnit}
          formatValue={formatKg}
          step="0.001"
          onChange={(value) => setField("kgPerUnit", value ?? 0)}
        />
      </td>
      <td className="px-2 py-3 text-right">
        <span className="font-bold text-gray-900">
          {formatKg(calculatePigYieldTotal(draft.unitsPerPig, draft.kgPerUnit))}
        </span>
      </td>
      <td className="px-2 py-3 text-right">
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
      </td>
    </tr>
  );
}

function PigYieldCard({
  item,
  onSave,
  onDelete,
}: {
  item: RendimentPorcApi;
  onSave: (id: number, patch: PigYieldPatch) => void;
  onDelete: (item: RendimentPorcApi) => void;
}) {
  const { draft, setField, save, isDirty } = useEditableRow(
    { unitsPerPig: Number(item.unitatsPerPorc), kgPerUnit: Number(item.kgPerUnitat) },
    (values) =>
      onSave(item.id, {
        unitatsPerPorc: parseDecimalInput(values.unitsPerPig, 2),
        kgPerUnitat: parseDecimalInput(values.kgPerUnit, 3),
      }),
  );

  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{item.categoria}</p>
      <p className="text-sm text-gray-500">{item.agrupacioProduccio ?? "—"}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs text-gray-500">Unitats per porc</p>
          <EditableCell
            value={draft.unitsPerPig}
            formatValue={formatUnits}
            step="0.01"
            onChange={(value) => setField("unitsPerPig", value ?? 0)}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-gray-500">Kg per unitat</p>
          <EditableCell
            value={draft.kgPerUnit}
            formatValue={formatKg}
            step="0.001"
            onChange={(value) => setField("kgPerUnit", value ?? 0)}
          />
        </div>
      </div>

      <div className="mt-3">
        <DataCardGrid columns={1}>
          <DataCardField label="Pes Total">
            <span className="font-bold text-gray-900">
              {formatKg(calculatePigYieldTotal(draft.unitsPerPig, draft.kgPerUnit))}
            </span>
          </DataCardField>
        </DataCardGrid>
      </div>

      <DataCardActions>
        <button
          type="button"
          onClick={save}
          disabled={!isDirty}
          className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${
            isDirty ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          Guardar
        </button>
        <IconButton variant="delete" label="Suprimeix línia" onClick={() => onDelete(item)} />
      </DataCardActions>
    </DataCard>
  );
}

export default function PigYieldsPage() {
  const { data, isLoading, error, createPigYield, updatePigYield, deletePigYield } = usePigYields();
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pigYieldToDelete, setPigYieldToDelete] = useState<RendimentPorcApi | null>(null);

  const categoryOptions = useMemo(
    () => [ALL_CATEGORIES, ...Array.from(new Set(data.map((item) => item.categoria)))],
    [data],
  );

  const filteredData = data.filter(
    (item) => categoryFilter === ALL_CATEGORIES || item.categoria === categoryFilter,
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
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {filteredData.map((item) => (
              <PigYieldCard key={item.id} item={item} onSave={updatePigYield} onDelete={setPigYieldToDelete} />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[14%] px-2 py-2 text-left font-medium text-gray-500 break-words">Categoria</th>
                  <th className="w-[22%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Agrupació Producció
                  </th>
                  <th className="w-[14%] px-2 py-2 text-right font-medium text-gray-500 break-words">
                    Unitats per porc
                  </th>
                  <th className="w-[14%] px-2 py-2 text-right font-medium text-gray-500 break-words">
                    Kg per unitat
                  </th>
                  <th className="w-[14%] px-2 py-2 text-right font-medium text-gray-500 break-words">Pes Total</th>
                  <th className="w-[22%] px-2 py-2 text-right font-medium text-gray-500 break-words">Accions</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item) => (
                  <PigYieldRow key={item.id} item={item} onSave={updatePigYield} onDelete={setPigYieldToDelete} />
                ))}
              </tbody>
            </table>
          </div>
        </>
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
            ? `Estàs segur que vols suprimir la línia "${pigYieldToDelete.categoria} · ${pigYieldToDelete.agrupacioProduccio ?? "—"}"? Aquesta acció no es pot desfer.`
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
