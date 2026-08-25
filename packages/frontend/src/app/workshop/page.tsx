"use client";

import { useMemo, useState } from "react";
import { ClearFiltersButton, FilterBar } from "@/components/ui/FilterBar";
import { DataCard, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateInput } from "@/components/ui/DateInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import type { ObradorLine } from "@/hooks/useObradorPanell";
import { useObradorPanell } from "@/hooks/useObradorPanell";
import { formatData } from "@/lib/dates";

const ALL = "Tots";

function formatKg(value: number) {
  return value.toFixed(3).replace(".", ",");
}

function WorkshopCard({ line }: { line: ObradorLine }) {
  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{line.productDescription}</p>
      <p className="text-sm text-gray-500">{line.clientName}</p>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Envasat">{line.packaging}</DataCardField>
          <DataCardField label="Format">{line.format}</DataCardField>
          <DataCardField label="Data producció">
            {line.productionDate ? formatData(line.productionDate, false) : "—"}
          </DataCardField>
          <DataCardField label="Unitats">{line.units}</DataCardField>
          <DataCardField label="Pes (kg)">{formatKg(line.weightKg)}</DataCardField>
        </DataCardGrid>
      </div>

      {line.productionNotes && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <DataCardField label="Obs. producció">{line.productionNotes}</DataCardField>
        </div>
      )}
    </DataCard>
  );
}

export default function WorkshopPage() {
  const { data, isLoading, error } = useObradorPanell();

  const [productSearch, setProductSearch] = useState("");
  const [packagingFilter, setPackagingFilter] = useState(ALL);
  const [formatFilter, setFormatFilter] = useState(ALL);
  const [productionDateFilter, setProductionDateFilter] = useState("");

  const packagingOptions = useMemo(
    () => [ALL, ...Array.from(new Set(data.map((line) => line.packaging)))],
    [data],
  );
  const formatOptions = useMemo(() => [ALL, ...Array.from(new Set(data.map((line) => line.format)))], [data]);

  const filtered = data.filter((line) => {
    if (productSearch && !line.productDescription.toLowerCase().includes(productSearch.toLowerCase())) {
      return false;
    }
    if (packagingFilter !== ALL && line.packaging !== packagingFilter) return false;
    if (formatFilter !== ALL && line.format !== formatFilter) return false;
    if (productionDateFilter && line.productionDate?.slice(0, 10) !== productionDateFilter) return false;
    return true;
  });

  const totalKg = filtered.reduce((sum, line) => sum + line.weightKg, 0);
  const totalUnits = filtered.reduce((sum, line) => sum + line.units, 0);

  function clearFilters() {
    setProductSearch("");
    setPackagingFilter(ALL);
    setFormatFilter(ALL);
    setProductionDateFilter("");
  }

  return (
    <div>
      <PageHeader
        title="Panell d'Obrador"
        subtitle="Línies de comanda per a la planificació d'obrador."
        right={
          <div className="flex gap-3">
            <StatCard
              label="TOTAL KG VISIBLES"
              value={formatKg(totalKg)}
              secondary={`${totalUnits} unitats`}
            />
            <StatCard label="TOTAL LÍNIES" value={filtered.length} />
          </div>
        }
      />

      <FilterBar>
        <SearchInput label="Producte" value={productSearch} onChange={setProductSearch} />
        <SelectFilter label="Envasat" options={packagingOptions} value={packagingFilter} onChange={setPackagingFilter} />
        <SelectFilter label="Format" options={formatOptions} value={formatFilter} onChange={setFormatFilter} />
        <DateInput label="Data de producció" value={productionDateFilter} onChange={setProductionDateFilter} />
        <ClearFiltersButton onClick={clearFilters} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar les línies.</p>}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {filtered.map((line) => (
              <WorkshopCard key={line.id} line={line} />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[16%] px-3 py-2 text-left font-medium text-gray-500 break-words">Producte</th>
                  <th className="w-[11%] px-3 py-2 text-left font-medium text-gray-500 break-words">Envasat</th>
                  <th className="w-[9%] px-3 py-2 text-left font-medium text-gray-500 break-words">Format</th>
                  <th className="w-[15%] px-3 py-2 text-left font-medium text-gray-500 break-words">Client</th>
                  <th className="w-[11%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Data producció
                  </th>
                  <th className="w-[8%] px-3 py-2 text-right font-medium text-gray-500 break-words">Unitats</th>
                  <th className="w-[10%] px-3 py-2 text-right font-medium text-gray-500 break-words">Pes (kg)</th>
                  <th className="w-[20%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Obs. producció
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((line) => (
                  <tr key={line.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-3 break-words">
                      <span className="font-semibold text-gray-900">{line.productDescription}</span>
                    </td>
                    <td className="px-3 py-3 break-words text-gray-900">{line.packaging}</td>
                    <td className="px-3 py-3 break-words text-gray-900">{line.format}</td>
                    <td className="px-3 py-3 break-words text-gray-900">{line.clientName}</td>
                    <td className="px-3 py-3 break-words text-gray-900">
                      {line.productionDate ? formatData(line.productionDate, false) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">{line.units}</td>
                    <td className="px-3 py-3 text-right text-gray-900">{formatKg(line.weightKg)}</td>
                    <td className="px-3 py-3 break-words text-gray-900">{line.productionNotes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
