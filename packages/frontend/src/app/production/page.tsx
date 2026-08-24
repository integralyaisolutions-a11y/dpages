"use client";

import { useState } from "react";
import { ClearFiltersButton, FilterBar } from "@/components/ui/FilterBar";
import { DateInput } from "@/components/ui/DateInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import { usePigConfig } from "@/hooks/usePigConfig";
import { useProductionPanell } from "@/hooks/useProductionPanell";

const ALL = "Totes";

function formatKg(value: number) {
  return value.toFixed(3).replace(".", ",");
}

function formatNumber(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function formatByMode(value: number | null, mode: string | null) {
  if (value === null) return "—";
  return mode === "KG" ? formatKg(value) : formatNumber(value);
}

export default function ProductionPage() {
  const [pigsToProduce, setPigsToProduce] = useState(1);
  const [modeFilter, setModeFilter] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: pigConfig } = usePigConfig();
  const { rows, isLoading, error } = useProductionPanell(pigsToProduce, dateFrom, dateTo);

  const filtered = rows.filter((row) => modeFilter === ALL || row.agrupacioRendiment === modeFilter);

  const totalKgAElaborar = filtered.reduce((sum, row) => sum + (row.kgAElaborar ?? 0), 0);
  const pernilKg = (pigConfig?.pernilKgPerPig ?? 0) * pigsToProduce;
  const retallsKg = (pigConfig?.retallsKgPerPig ?? 0) * pigsToProduce;
  const espatllesKg = (pigConfig?.espatllesKgPerPig ?? 0) * pigsToProduce;
  const totalKgMagre = pernilKg + retallsKg + espatllesKg;
  const diferenciaTotal = totalKgMagre - totalKgAElaborar;

  function clearFilters() {
    setModeFilter(ALL);
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div>
      <PageHeader
        title="Panell Producció"
        subtitle="Kg a elaborar per producte segons els porcs previstos."
      />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">N° porcs per elaborar</span>
            <input
              type="number"
              min={0}
              value={pigsToProduce}
              onChange={(event) => setPigsToProduce(Number(event.target.value) || 0)}
              className="w-full max-w-[160px] rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            />
          </label>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500">KG Rendiment Pernil</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatKg(pernilKg)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">KG Retalls</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatKg(retallsKg)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">KG Espatlles</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatKg(espatllesKg)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="TOTAL KG A ELABORAR" value={formatKg(totalKgAElaborar)} />
            <StatCard label="TOTAL KG MAGRE" value={formatKg(totalKgMagre)} />
            <StatCard label="DIFERÈNCIA" value={formatKg(diferenciaTotal)} alert={diferenciaTotal < 0} />
          </div>
        </div>
      </div>

      <FilterBar>
        <SelectFilter
          label="Agrupació Rendiment"
          options={[ALL, "MAGRE", "KG", "PAQ"]}
          value={modeFilter}
          onChange={setModeFilter}
        />
        <DateInput label="Data producció des de" value={dateFrom} onChange={setDateFrom} />
        <DateInput label="Data producció fins a" value={dateTo} onChange={setDateTo} />
        <ClearFiltersButton onClick={clearFilters} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar les dades.</p>}

      {!isLoading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="w-[13%] px-3 py-2 text-left font-medium text-gray-500">Agrupació Rendiment</th>
                <th className="w-[22%] px-3 py-2 text-left font-medium text-gray-500">Agrupació Producció</th>
                <th className="w-[16%] px-3 py-2 text-right font-medium text-gray-500">Paq. Comanda</th>
                <th className="w-[16%] px-3 py-2 text-right font-medium text-gray-500">Kg a Elaborar</th>
                <th className="w-[16%] px-3 py-2 text-right font-medium text-gray-500">Rendiment</th>
                <th className="w-[17%] px-3 py-2 text-right font-medium text-gray-500">Diferència</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isNegative = row.diferencia !== null && row.diferencia < 0;
                return (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-3 text-gray-900">{row.agrupacioRendiment}</td>
                    <td className="px-3 py-3 break-words">
                      <span className="font-semibold text-gray-900">{row.agrupacioProduccio}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">
                      {row.paqComanda !== null ? row.paqComanda : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">
                      {row.kgAElaborar !== null ? formatKg(row.kgAElaborar) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">{formatByMode(row.rendiment, row.mode)}</td>
                    <td
                      className={`px-3 py-3 text-right ${isNegative ? "bg-red-600 font-medium text-white" : "text-gray-900"}`}
                    >
                      {formatByMode(row.diferencia, row.mode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
