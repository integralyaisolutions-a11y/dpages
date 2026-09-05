'use client';

import { useMemo, useState } from 'react';
import { ClearFiltersButton, FilterBar } from '@/components/ui/FilterBar';
import { DataCard, DataCardField, DataCardGrid } from '@/components/ui/DataCard';
import { DateInput } from '@/components/ui/DateInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SelectFilter } from '@/components/ui/SelectFilter';
import { StatCard } from '@/components/ui/StatCard';
import { useCatalog } from '@/hooks/useCatalog';
import { type ToggleTreballResult, usePanellObrador } from '@/hooks/usePanellObrador';
import type { FilaPanellObradorApi } from '@/lib/api';
import { formatData } from '@/lib/dates';
import { formatDecimal } from '@/lib/decimals';

const ALL = 'Tots';

// Valors fixos del enum real (ProducteApi.format/envasat, contrato §4.2) —
// filtres exactes contra el backend, no es deriven de `data` perquè són un
// conjunt tancat conegut, no un catàleg lliure.
const FORMAT_OPTIONS = ['SENCER', 'TALLAT', 'LLESCAT'];
const ENVASAT_OPTIONS = ['NORMAL', 'NORMAL (pes)', 'NORMAL (web)', 'ESPECIAL'];

function leftBorderClass(treballat: boolean) {
  return treballat ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-gray-200';
}

/**
 * Capa 40 — a diferència del checkbox de sòl lectura d'Empaquetat
 * (`WorkedCheckbox`, packaging/page.tsx), aquest SÍ dispara la crida real:
 * el propi click és l'acció, sense formulari ni botó "Guardar" separat.
 * Estat optimista local: es marca/desmarca a l'instant i es desactiva
 * mentre la crida està en curs; si falla, torna a l'últim valor confirmat
 * pel servidor (`treballatA`, mai tocat mentre la crida falla) i mostra
 * l'error just sota el checkbox d'aquesta fila, no de tota la pantalla.
 */
function useTreballToggle(
  comandaId: number,
  liniaId: number,
  treballatA: string | null,
  onToggle: (comandaId: number, liniaId: number, marcat: boolean) => Promise<ToggleTreballResult>,
) {
  const [pending, setPending] = useState<boolean | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checked = pending ?? treballatA !== null;

  async function handleChange() {
    const next = !checked;
    setPending(next);
    setIsToggling(true);
    setError(null);
    const result = await onToggle(comandaId, liniaId, next);
    setIsToggling(false);
    setPending(null);
    if (!result.success) setError(result.error);
  }

  return { checked, isToggling, error, handleChange };
}

function TreballCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={checked ? 'Marcar com a pendent' : 'Marcar com a treballada'}
      className="h-4 w-4 rounded border-gray-300 text-ink disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function WorkshopCard({
  line,
  onToggle,
}: {
  line: FilaPanellObradorApi;
  onToggle: (comandaId: number, liniaId: number, marcat: boolean) => Promise<ToggleTreballResult>;
}) {
  const { checked, isToggling, error, handleChange } = useTreballToggle(
    line.comandaId,
    line.liniaId,
    line.treballatA,
    onToggle,
  );

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        className={`absolute inset-y-0 left-0 w-1 ${checked ? 'bg-green-500' : 'bg-gray-200'}`}
      />
      <DataCard>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900">{line.producte.descripcio}</p>
            <p className="text-sm text-gray-500">{line.client ?? '—'}</p>
          </div>
          <TreballCheckbox checked={checked} disabled={isToggling} onChange={handleChange} />
        </div>

        <div className="mt-3">
          <DataCardGrid>
            <DataCardField label="Envasat">{line.envasat ?? '—'}</DataCardField>
            <DataCardField label="Format">{line.format ?? '—'}</DataCardField>
            <DataCardField label="Data producció">
              {line.dataProduccio ? formatData(line.dataProduccio, false) : '—'}
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
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </DataCard>
    </div>
  );
}

function WorkshopRow({
  line,
  onToggle,
}: {
  line: FilaPanellObradorApi;
  onToggle: (comandaId: number, liniaId: number, marcat: boolean) => Promise<ToggleTreballResult>;
}) {
  const { checked, isToggling, error, handleChange } = useTreballToggle(
    line.comandaId,
    line.liniaId,
    line.treballatA,
    onToggle,
  );

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className={`${leftBorderClass(checked)} px-3 py-3 text-center`}>
        <TreballCheckbox checked={checked} disabled={isToggling} onChange={handleChange} />
        {error && <p className="mt-1 max-w-[100px] text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-3 py-3 break-words">
        <span className="font-semibold text-gray-900">{line.producte.descripcio}</span>
      </td>
      <td className="px-3 py-3 break-words text-gray-900">{line.envasat ?? '—'}</td>
      <td className="px-3 py-3 break-words text-gray-900">{line.format ?? '—'}</td>
      <td className="px-3 py-3 break-words text-gray-900">{line.client ?? '—'}</td>
      <td className="px-3 py-3 break-words text-gray-900">
        {line.dataProduccio ? formatData(line.dataProduccio, false) : '—'}
      </td>
      <td className="px-3 py-3 text-right text-gray-900">{formatDecimal(line.unitats, 2)}</td>
      <td className="px-3 py-3 text-right text-gray-900">{formatDecimal(line.kg, 3)}</td>
      <td className="px-3 py-3 break-words text-gray-900">{line.obsProduccio ?? ''}</td>
    </tr>
  );
}

export default function WorkshopPage() {
  const { data: catalog } = useCatalog();

  const [productFilter, setProductFilter] = useState(ALL);
  const [envasatFilter, setEnvasatFilter] = useState(ALL);
  const [formatFilter, setFormatFilter] = useState(ALL);
  const [productionDateFilter, setProductionDateFilter] = useState('');

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

  // Capa 46 — "pendents primer" ja ve per defecte des del backend (GET
  // /panells/obrador, ORDER BY treballat_a IS NOT NULL ASC), sense cap
  // paràmetre — confirmat amb curl real abans de treure el sort client-side
  // que hi havia acá com a pedaç temporal.
  const { data, totals, paginacio, setPagina, isLoading, error, refetch, toggleTreball } =
    usePanellObrador(filters);

  function clearFilters() {
    setProductFilter(ALL);
    setEnvasatFilter(ALL);
    setFormatFilter(ALL);
    setProductionDateFilter('');
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
        <SelectFilter
          label="Producte"
          options={productOptions}
          value={productFilter}
          onChange={setProductFilter}
        />
        <SelectFilter
          label="Envasat"
          options={[ALL, ...ENVASAT_OPTIONS]}
          value={envasatFilter}
          onChange={setEnvasatFilter}
        />
        <SelectFilter
          label="Format"
          options={[ALL, ...FORMAT_OPTIONS]}
          value={formatFilter}
          onChange={setFormatFilter}
        />
        <DateInput
          label="Data de producció"
          value={productionDateFilter}
          onChange={setProductionDateFilter}
        />
        <ClearFiltersButton onClick={clearFilters} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">
            No s&apos;han pogut carregar les línies: {error.message}
          </p>
          <button
            type="button"
            onClick={refetch}
            className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Torna-ho a provar
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 md:hidden">
            {data.map((line) => (
              <WorkshopCard key={line.liniaId} line={line} onToggle={toggleTreball} />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[5%] px-3 py-2 text-center font-medium text-gray-500 break-words">
                    <span className="sr-only">Treballada</span>
                  </th>
                  <th className="w-[15%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Producte
                  </th>
                  <th className="w-[10%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Envasat
                  </th>
                  <th className="w-[8%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Format
                  </th>
                  <th className="w-[14%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Client
                  </th>
                  <th className="w-[10%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Data producció
                  </th>
                  <th className="w-[8%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Unitats
                  </th>
                  <th className="w-[10%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Pes (kg)
                  </th>
                  <th className="w-[20%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Obs. producció
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((line) => (
                  <WorkshopRow key={line.liniaId} line={line} onToggle={toggleTreball} />
                ))}
              </tbody>
            </table>
          </div>

          {paginacio && <Pagination paginacio={paginacio} onPageChange={setPagina} />}
        </>
      )}
    </div>
  );
}
