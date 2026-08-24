"use client";

import { useState } from "react";
import { ClearFiltersButton, FilterBar } from "@/components/ui/FilterBar";
import { DataCard, DataCardActions, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateInput } from "@/components/ui/DateInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import { useCarriers } from "@/hooks/useCarriers";
import { useEditableRow } from "@/hooks/useEditableRow";
import { usePackagingPanell, type PackagingLine } from "@/hooks/usePackagingPanell";
import { formatDateDisplay } from "@/lib/orderCalculations";

const ALL = "Tots";

function formatKg(value: number) {
  return value.toFixed(3).replace(".", ",");
}

function PackagingRow({
  line,
  onSave,
}: {
  line: PackagingLine;
  onSave: (orderNumber: string, lineId: string, deliveredUnits: number, deliveredWeightKg: number) => void;
}) {
  const { draft, setField, save, isDirty } = useEditableRow(
    { deliveredUnits: String(line.deliveredUnits), deliveredWeightKg: String(line.deliveredWeightKg) },
    (values) => {
      const deliveredUnits = Number(values.deliveredUnits.replace(",", ".")) || 0;
      const deliveredWeightKg = Number(values.deliveredWeightKg.replace(",", ".")) || 0;
      onSave(line.orderNumber, line.id, deliveredUnits, deliveredWeightKg);
    },
  );

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3 py-3 break-words text-gray-900">
        {line.shippingDate ? formatDateDisplay(line.shippingDate) : "—"}
      </td>
      <td className="px-3 py-3 break-words text-gray-900">
        {line.deliveryDate ? formatDateDisplay(line.deliveryDate) : "—"}
      </td>
      <td className="px-3 py-3 break-words text-gray-900">{line.carrierName}</td>
      <td className="px-3 py-3 break-words">
        <span className="font-semibold text-gray-900">{line.productDescription}</span>
      </td>
      <td className="px-3 py-3 break-words text-gray-900">{line.clientName}</td>
      <td className="px-3 py-3 text-right text-gray-900">{line.orderedUnits}</td>
      <td className="px-3 py-3">
        <input
          type="number"
          step="0.01"
          value={draft.deliveredUnits}
          onChange={(event) => setField("deliveredUnits", event.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
        />
      </td>
      <td className="px-3 py-3 text-right text-gray-900">{formatKg(line.orderedWeightKg)}</td>
      <td className="px-3 py-3">
        <input
          type="number"
          step="0.001"
          value={draft.deliveredWeightKg}
          onChange={(event) => setField("deliveredWeightKg", event.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
        />
      </td>
      <td className="px-3 py-3 text-center">
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
      </td>
    </tr>
  );
}

function PackagingCard({
  line,
  onSave,
}: {
  line: PackagingLine;
  onSave: (orderNumber: string, lineId: string, deliveredUnits: number, deliveredWeightKg: number) => void;
}) {
  const { draft, setField, save, isDirty } = useEditableRow(
    { deliveredUnits: String(line.deliveredUnits), deliveredWeightKg: String(line.deliveredWeightKg) },
    (values) => {
      const deliveredUnits = Number(values.deliveredUnits.replace(",", ".")) || 0;
      const deliveredWeightKg = Number(values.deliveredWeightKg.replace(",", ".")) || 0;
      onSave(line.orderNumber, line.id, deliveredUnits, deliveredWeightKg);
    },
  );

  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{line.productDescription}</p>
      <p className="text-sm text-gray-500">{line.clientName}</p>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Data d'expedició">
            {line.shippingDate ? formatDateDisplay(line.shippingDate) : "—"}
          </DataCardField>
          <DataCardField label="Data de lliurament">
            {line.deliveryDate ? formatDateDisplay(line.deliveryDate) : "—"}
          </DataCardField>
          <DataCardField label="Transportista">{line.carrierName}</DataCardField>
          <DataCardField label="Unitats demanades">{line.orderedUnits}</DataCardField>
          <DataCardField label="Kilos demanats">{formatKg(line.orderedWeightKg)}</DataCardField>
        </DataCardGrid>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Unitats lliurades</span>
          <input
            type="number"
            step="0.01"
            value={draft.deliveredUnits}
            onChange={(event) => setField("deliveredUnits", event.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Kilos lliurats</span>
          <input
            type="number"
            step="0.001"
            value={draft.deliveredWeightKg}
            onChange={(event) => setField("deliveredWeightKg", event.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </label>
      </div>

      <DataCardActions>
        <button
          type="button"
          onClick={save}
          disabled={!isDirty}
          className={`w-full rounded-full px-3 py-2 text-sm font-semibold ${
            isDirty ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          Guardar
        </button>
      </DataCardActions>
    </DataCard>
  );
}

export default function PackagingPage() {
  const { data, isLoading, error, saveLineDelivery } = usePackagingPanell();
  const { data: carriers } = useCarriers();

  const [shippingDateFilter, setShippingDateFilter] = useState("");
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  const [carrierFilter, setCarrierFilter] = useState(ALL);
  const [productSearch, setProductSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  function clearFilters() {
    setShippingDateFilter("");
    setDeliveryDateFilter("");
    setCarrierFilter(ALL);
    setProductSearch("");
    setClientSearch("");
  }

  const filtered = data.filter((line) => {
    if (shippingDateFilter && line.shippingDate !== shippingDateFilter) return false;
    if (deliveryDateFilter && line.deliveryDate !== deliveryDateFilter) return false;
    if (carrierFilter !== ALL && line.carrierName !== carrierFilter) return false;
    if (productSearch && !line.productDescription.toLowerCase().includes(productSearch.toLowerCase())) return false;
    if (clientSearch && !line.clientName.toLowerCase().includes(clientSearch.toLowerCase())) return false;
    return true;
  });

  const totalUnits = filtered.reduce((sum, line) => sum + line.orderedUnits, 0);

  return (
    <div>
      <PageHeader
        title="Panell d'Empaquetat"
        subtitle="Línies de comanda per a la planificació d'empaquetat."
        right={
          <div className="flex gap-3">
            <StatCard label="TOTAL UNITATS VISIBLES" value={totalUnits} />
            <StatCard label="TOTAL LÍNIES" value={filtered.length} />
          </div>
        }
      />

      <FilterBar>
        <DateInput label="Data d'expedició" value={shippingDateFilter} onChange={setShippingDateFilter} />
        <DateInput label="Data de lliurament" value={deliveryDateFilter} onChange={setDeliveryDateFilter} />
        <SelectFilter
          label="Transportista"
          options={[ALL, ...carriers.map((item) => item.name)]}
          value={carrierFilter}
          onChange={setCarrierFilter}
        />
        <SearchInput label="Producte" value={productSearch} onChange={setProductSearch} />
        <SearchInput label="Client" value={clientSearch} onChange={setClientSearch} />
        <ClearFiltersButton onClick={clearFilters} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar les línies.</p>}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {filtered.map((line) => (
              <PackagingCard key={line.id} line={line} onSave={saveLineDelivery} />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[10%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Data d&apos;expedició
                  </th>
                  <th className="w-[9%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Data de lliurament
                  </th>
                  <th className="w-[12%] px-3 py-2 text-left font-medium text-gray-500 break-words">Transportista</th>
                  <th className="w-[12%] px-3 py-2 text-left font-medium text-gray-500 break-words">Producte</th>
                  <th className="w-[10%] px-3 py-2 text-left font-medium text-gray-500 break-words">Client</th>
                  <th className="w-[10%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Unitats demanades
                  </th>
                  <th className="w-[9%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Unitats lliurades
                  </th>
                  <th className="w-[9%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Kilos demanats
                  </th>
                  <th className="w-[9%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Kilos lliurats
                  </th>
                  <th className="w-[10%] px-3 py-2 text-center font-medium text-gray-500 break-words">Guardar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((line) => (
                  <PackagingRow key={line.id} line={line} onSave={saveLineDelivery} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
