"use client";

import { useMemo, useState } from "react";
import { ClearFiltersButton, FilterBar } from "@/components/ui/FilterBar";
import { DataCard, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateInput } from "@/components/ui/DateInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import { useCatalog } from "@/hooks/useCatalog";
import { usePanellObrador } from "@/hooks/usePanellObrador";
import type { FilaPanellObradorApi } from "@/lib/api";
import { formatData } from "@/lib/dates";
import { formatDecimal } from "@/lib/decimals";

const ALL = "Tots";

// Valors fixos del enum real (ProducteApi.format/envasat, contrato §4.2) —
// filtres exactes contra el backend, no es deriven de `data` perquè són un
// conjunt tancat conegut, no un catàleg lliure.
const FORMAT_OPTIONS = ["SENCER", "TALLAT", "LLESCAT"];
const ENVASAT_OPTIONS = ["NORMAL", "NORMAL (pes)", "NORMAL (web)", "ESPECIAL"];

function WorkshopCard({ line }: { line: FilaPanellObradorApi }) {
  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{line.producte.descripcio}</p>
      <p className="text-sm text-gray-500">{line.client ?? "—"}</p>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Envasat">{line.envasat ?? "—"}</DataCardField>
          <DataCardField label="Format">{line.format ?? "—"}</DataCardField>
          <DataCardField label="Data producció">
            {line.dataProduccio ? formatData(line.dataProduccio, false) : "—"}
          </DataCardField>
          <DataCardField label="Unitats">{formatDecimal(line.unitats, 2)}</DataCardField>
          <DataCardField label="Pes (kg)">{formatDecimal(line.kg, 3)}</DataCardField>
        </DataCardGrid>
      </div>

      {line.obsProduccio && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <DataCardField label="Obs. producció">{line.obsProduccio}</DataCardField>
        </div>
      )}
    </DataCard>
  );
}

export default function WorkshopPage() {
  const { data: catalog } = useCatalog();

  const [productFilter, setProductFilter] = useState(ALL);
  const [envasatFilter, setEnvasatFilter] = useState(ALL);
  const [formatFilter, setFormatFilter] = useState(ALL);
  const [productionDateFilter, setProductionDateFilter] = useState("");

  const productOptions = useMemo(
    () => [ALL, ...Array.from(new Set(catalog.map((product) => product.descripcio))).sort()],
    [catalog],
  );

  const filters = useMemo(
    () => ({
      ...(productFilter !== ALL ? { producte: productFilter } : {}),
      ...(envasatFilter !== ALL ? { envasat: envasatFilter } : {}),
      ...(formatFilter !== ALL ? { format: formatFilter } : {}),
      ...(productionDateFilter
        ? { dataProduccioDes: productionDateFilter, dataProduccioFins: productionDateFilter }
        : {}),
    }),
    [productFilter, envasatFilter, formatFilter, productionDateFilter],
  );

  const { data, totals, isLoading, error, refetch } = usePanellObrador(filters);

  function clearFilters() {
    setProductFilter(ALL);
    setEnvasatFilter(ALL);
    setFormatFilter(ALL);
    setProductionDateFilter("");
  }

  return (
    <div>
      <PageHeader
        title="Panell d'Obrador"
        subtitle="Línies de comanda per a la planificació d'obrador."
        right={
          <div className="flex flex-wrap gap-3">
            <StatCard
              label="TOTAL KG VISIBLES"
              value={formatDecimal(totals?.totalKg ?? null, 3)}
              secondary={`${formatDecimal(totals?.totalUnitats ?? null, 2)} unitats`}
            />
            <StatCard label="TOTAL LÍNIES" value={totals?.linies ?? 0} />
          </div>
        }
      />

      <FilterBar>
        <SelectFilter label="Producte" options={productOptions} value={productFilter} onChange={setProductFilter} />
        <SelectFilter label="Envasat" options={[ALL, ...ENVASAT_OPTIONS]} value={envasatFilter} onChange={setEnvasatFilter} />
        <SelectFilter label="Format" options={[ALL, ...FORMAT_OPTIONS]} value={formatFilter} onChange={setFormatFilter} />
        <DateInput label="Data de producció" value={productionDateFilter} onChange={setProductionDateFilter} />
        <ClearFiltersButton onClick={clearFilters} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;han pogut carregar les línies: {error.message}</p>
          <button
            type="button"
            onClick={refetch}
            className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {data.map((line) => (
              <WorkshopCard key={line.liniaId} line={line} />
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
                {data.map((line) => (
                  <tr key={line.liniaId} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-3 break-words">
                      <span className="font-semibold text-gray-900">{line.producte.descripcio}</span>
                    </td>
                    <td className="px-3 py-3 break-words text-gray-900">{line.envasat ?? "—"}</td>
                    <td className="px-3 py-3 break-words text-gray-900">{line.format ?? "—"}</td>
                    <td className="px-3 py-3 break-words text-gray-900">{line.client ?? "—"}</td>
                    <td className="px-3 py-3 break-words text-gray-900">
                      {line.dataProduccio ? formatData(line.dataProduccio, false) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">{formatDecimal(line.unitats, 2)}</td>
                    <td className="px-3 py-3 text-right text-gray-900">{formatDecimal(line.kg, 3)}</td>
                    <td className="px-3 py-3 break-words text-gray-900">{line.obsProduccio ?? ""}</td>
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
