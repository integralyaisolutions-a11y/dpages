"use client";

import { useMemo, useState } from "react";
import { ClearFiltersButton, FilterBar } from "@/components/ui/FilterBar";
import { DataCard, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateInput } from "@/components/ui/DateInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import { useCatalog } from "@/hooks/useCatalog";
import { useProductionPanell } from "@/hooks/useProductionPanell";
import type { PanellProduccioFilaApi } from "@/lib/api";
import { formatDecimal } from "@/lib/decimals";

const ALL = "Totes";
const AGRUPACIONS_RENDIMENT = ["KG", "MAGRE", "PAQ"];

/**
 * Mateix càlcul EXACTE que `dataIsoAmbOffset` del backend (panells.ts) —
 * només per mostrar visualment el default que el backend ja aplica sol.
 * Es calcula acá però NO es manda mai al request tret que l'usuari toqui
 * el camp (ver `dateFromTouched`/`dateToTouched` més avall): si el criteri
 * de negoci canvia del costat del backend, aquest càlcul pot quedar
 * desactualitzat un dia fins que algú ho noti, però mai es manda un valor
 * que contradigui el que el backend faria sol.
 */
function dataIsoAmbOffset(diesOffset: number): string {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + diesOffset);
  return data.toISOString().slice(0, 10);
}

/**
 * rendiment/diferencia ja arriben com a string amb la precisió que va
 * triar el backend segons el tipus d'agrupació (2 decimals a PAQ, 3 a KG,
 * `panells.ts`) — acá només es converteix el separador, mai es
 * reparseja/redondeja de nou.
 */
function formatBackendDecimal(value: string | null): string {
  return value !== null ? value.replace(".", ",") : "—";
}

function isNegative(value: string | null): boolean {
  return value !== null && Number(value) < 0;
}

function ProductionRow({ row }: { row: PanellProduccioFilaApi }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3 py-3 break-words text-gray-900">{row.agrupacioRendiment}</td>
      <td className="px-3 py-3 break-words">
        <span className="font-semibold text-gray-900">{row.agrupacioProduccio}</span>
      </td>
      <td className="px-3 py-3 text-right text-gray-900">{formatBackendDecimal(row.paqPedido)}</td>
      <td className="px-3 py-3 text-right text-gray-900">{formatDecimal(row.kgAElaborar, 3)}</td>
      <td className="px-3 py-3 text-right text-gray-900">{formatBackendDecimal(row.rendiment)}</td>
      <td
        className={`px-3 py-3 text-right ${
          isNegative(row.diferencia) ? "bg-red-600 font-medium text-white" : "text-gray-900"
        }`}
      >
        {formatBackendDecimal(row.diferencia)}
      </td>
    </tr>
  );
}

function ProductionCard({ row }: { row: PanellProduccioFilaApi }) {
  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{row.agrupacioProduccio}</p>
      <p className="text-sm text-gray-500">{row.agrupacioRendiment}</p>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Paq. Comanda">{formatBackendDecimal(row.paqPedido)}</DataCardField>
          <DataCardField label="Kg a Elaborar">{formatDecimal(row.kgAElaborar, 3)}</DataCardField>
          <DataCardField label="Rendiment">{formatBackendDecimal(row.rendiment)}</DataCardField>
          <DataCardField label="Diferència" tone={isNegative(row.diferencia) ? "negative" : "default"}>
            {formatBackendDecimal(row.diferencia)}
          </DataCardField>
        </DataCardGrid>
      </div>
    </DataCard>
  );
}

export default function ProductionPage() {
  const { data: catalog } = useCatalog();

  const [nombrePorcsInput, setNombrePorcsInput] = useState("1");
  const [agrupacioFilter, setAgrupacioFilter] = useState(ALL);
  const [productFilter, setProductFilter] = useState(ALL);
  // Es precarreguen amb el mateix default que aplica el backend, però
  // `touched` és el que decideix si viatgen al request — ver comentari de
  // `dataIsoAmbOffset` més amunt.
  const [dateFrom, setDateFrom] = useState(() => dataIsoAmbOffset(1));
  const [dateTo, setDateTo] = useState(() => dataIsoAmbOffset(7));
  const [dateFromTouched, setDateFromTouched] = useState(false);
  const [dateToTouched, setDateToTouched] = useState(false);

  const productOptions = useMemo(
    () => [ALL, ...Array.from(new Set(catalog.map((product) => product.descripcio))).sort()],
    [catalog],
  );

  // nombrePorcs és obligatori pel backend (400 sense ell) — mai s'envia
  // un default inventat des del frontend (el "12" del mockup no tenia cap
  // suport real, ver informe d'investigació). Mentre el camp estigui buit
  // o no sigui > 0, el hook no dispara cap fetch (isReady).
  const nombrePorcs = nombrePorcsInput.trim() === "" ? null : Number(nombrePorcsInput);
  const nombrePorcsValid = nombrePorcs !== null && Number.isFinite(nombrePorcs) && nombrePorcs > 0;
  // El backend ja rebutja ≤0 amb 400 — acá es talla abans de disparar cap
  // fetch i es mostra un missatge concret vora el camp, en comptes de
  // deixar que arribi l'error genèric del backend. El camp buit es tracta
  // exactament igual que 0/negatiu: sense fetch, mateix missatge.
  const nombrePorcsError = !nombrePorcsValid ? "El mínim és 1." : null;

  const filters = useMemo(
    () => ({
      nombrePorcs: nombrePorcsValid ? nombrePorcs : null,
      ...(agrupacioFilter !== ALL ? { agrupacioRendiment: agrupacioFilter } : {}),
      ...(productFilter !== ALL ? { producte: productFilter } : {}),
      // dataDes/dataFins es mostren precarregades amb el default real del
      // backend, però SÓLO viatgen al request si l'usuari va tocar el camp
      // a mà — si no, el backend aplica el seu propi default sol.
      ...(dateFromTouched ? { dataDes: dateFrom } : {}),
      ...(dateToTouched ? { dataFins: dateTo } : {}),
    }),
    [nombrePorcsValid, nombrePorcs, agrupacioFilter, productFilter, dateFrom, dateFromTouched, dateTo, dateToTouched],
  );

  const { data, totals, paginacio, setPagina, isLoading, error, refetch, isReady } = useProductionPanell(filters);

  function clearFilters() {
    setAgrupacioFilter(ALL);
    setProductFilter(ALL);
    setDateFrom(dataIsoAmbOffset(1));
    setDateTo(dataIsoAmbOffset(7));
    setDateFromTouched(false);
    setDateToTouched(false);
  }

  return (
    <div>
      <PageHeader title="Panell Producció" subtitle="Kg a elaborar per producte segons els porcs previstos." />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">N° porcs per elaborar</span>
            <input
              type="number"
              min={1}
              value={nombrePorcsInput}
              onChange={(event) => setNombrePorcsInput(event.target.value)}
              placeholder="Introdueix un valor"
              className="w-full max-w-[160px] rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            />
            {nombrePorcsError && <span className="text-xs text-red-600">{nombrePorcsError}</span>}
          </label>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-gray-500">KG Rendiment Pernil</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatDecimal(totals?.kgJamon ?? null, 3)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">KG Retalls</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatDecimal(totals?.kgRecortes ?? null, 3)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">KG Espatlles</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatDecimal(totals?.kgPaletillas ?? null, 3)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="TOTAL KG A ELABORAR" value={formatDecimal(totals?.totalKgAElaborar ?? null, 3)} />
            <StatCard label="TOTAL KG MAGRE" value={formatDecimal(totals?.totalKgMagro ?? null, 3)} />
            <StatCard
              label="DIFERÈNCIA"
              value={formatDecimal(totals?.diferencia ?? null, 3)}
              alert={isNegative(totals?.diferencia ?? null)}
            />
          </div>
        </div>
      </div>

      <FilterBar>
        <SelectFilter
          label="Agrupació Rendiment"
          options={[ALL, ...AGRUPACIONS_RENDIMENT]}
          value={agrupacioFilter}
          onChange={setAgrupacioFilter}
        />
        <SelectFilter label="Producte" options={productOptions} value={productFilter} onChange={setProductFilter} />
        <DateInput
          label="Data producció des de"
          value={dateFrom}
          onChange={(value) => {
            setDateFrom(value);
            setDateFromTouched(true);
          }}
        />
        <DateInput
          label="Data producció fins a"
          value={dateTo}
          onChange={(value) => {
            setDateTo(value);
            setDateToTouched(true);
          }}
        />
        <ClearFiltersButton onClick={clearFilters} />
      </FilterBar>

      {!isReady && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          Introdueix el nombre de porcs per elaborar per veure els càlculs.
        </p>
      )}
      {isReady && isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {isReady && error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;han pogut carregar les dades: {error.message}</p>
          <button
            type="button"
            onClick={refetch}
            className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Torna-ho a provar
          </button>
        </div>
      )}

      {isReady && !isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {data.map((row) => (
              <ProductionCard key={`${row.agrupacioProduccio}-${row.agrupacioRendiment}`} row={row} />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[13%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Agrupació Rendiment
                  </th>
                  <th className="w-[22%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Agrupació Producció
                  </th>
                  <th className="w-[16%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Paq. Comanda
                  </th>
                  <th className="w-[16%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Kg a Elaborar
                  </th>
                  <th className="w-[16%] px-3 py-2 text-right font-medium text-gray-500 break-words">Rendiment</th>
                  <th className="w-[17%] px-3 py-2 text-right font-medium text-gray-500 break-words">Diferència</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <ProductionRow key={`${row.agrupacioProduccio}-${row.agrupacioRendiment}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Probablement sempre totalPagines=1 en la pràctica (les files
              venen d'un GROUP BY agrupacioProduccio×agrupacioRendiment,
              acotat pel catàleg real) — es mostra igual per consistència
              amb la resta de pantalles. */}
          {paginacio && <Pagination paginacio={paginacio} onPageChange={setPagina} />}
        </>
      )}
    </div>
  );
}
