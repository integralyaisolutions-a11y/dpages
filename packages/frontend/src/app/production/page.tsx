'use client';

import { useMemo, useState } from 'react';
import { AsyncCombobox } from '@/components/ui/AsyncCombobox';
import { ClearFiltersButton, FilterBar } from '@/components/ui/FilterBar';
import { DataCard, DataCardField, DataCardGrid } from '@/components/ui/DataCard';
import { DateInput } from '@/components/ui/DateInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SimpleDropdown } from '@/components/ui/SimpleDropdown';
import { StatCard } from '@/components/ui/StatCard';
import { useCatalog } from '@/hooks/useCatalog';
import { useProductionPanell } from '@/hooks/useProductionPanell';
import type { PanellProduccioFilaApi } from '@/lib/api';
import { formatDecimal } from '@/lib/decimals';
import { MAX_LOCAL_COMBOBOX_RESULTS, matchesProductQuery } from '@/lib/productSearch';

const ALL = 'Totes';
const AGRUPACIONS_RENDIMENT = ['KG', 'MAGRE', 'PAQ'];

/**
 * rendiment/diferencia ja arriben com a string amb la precisió que va
 * triar el backend segons el tipus d'agrupació (2 decimals a PAQ, 3 a KG,
 * `panells.ts`) — acá només es converteix el separador, mai es
 * reparseja/redondeja de nou.
 */
function formatBackendDecimal(value: string | null): string {
  return value !== null ? value.replace('.', ',') : '—';
}

function isNegative(value: string | null): boolean {
  return value !== null && Number(value) < 0;
}

// Issue #20 (Francesc, confirmat) — Rendiment/Diferència per fila NOMÉS
// tenen sentit de negoci per KG/PAQ (l'única branca del backend que els
// calcula per línia, ver panells.ts). Per MAGRE/Totes es força '—' encara
// que la fila porti un valor real (a "Totes" les files KG/PAQ sí en
// porten): la condició depèn del FILTRE actiu, no de l'agrupacioRendiment
// de cada fila individual — no n'hi ha prou en confiar que vinguin buides.
function showRowRendiment(agrupacioFilter: string): boolean {
  return agrupacioFilter === 'KG' || agrupacioFilter === 'PAQ';
}

function ProductionRow({
  row,
  showRendiment,
}: {
  row: PanellProduccioFilaApi;
  showRendiment: boolean;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3 py-3 break-words text-gray-900">{row.agrupacioRendiment}</td>
      <td className="px-3 py-3 break-words">
        <span className="font-semibold text-gray-900">{row.agrupacioProduccio}</span>
      </td>
      <td className="px-3 py-3 text-right text-gray-900">{formatBackendDecimal(row.paqPedido)}</td>
      <td className="px-3 py-3 text-right text-gray-900">{formatDecimal(row.kgAElaborar, 3)}</td>
      <td className="px-3 py-3 text-right text-gray-900">
        {showRendiment ? formatBackendDecimal(row.rendiment) : '—'}
      </td>
      <td
        className={`px-3 py-3 text-right ${
          showRendiment && isNegative(row.diferencia)
            ? 'bg-red-600 font-medium text-white'
            : 'text-gray-900'
        }`}
      >
        {showRendiment ? formatBackendDecimal(row.diferencia) : '—'}
      </td>
    </tr>
  );
}

function ProductionCard({
  row,
  showRendiment,
}: {
  row: PanellProduccioFilaApi;
  showRendiment: boolean;
}) {
  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{row.agrupacioProduccio}</p>
      <p className="text-sm text-gray-500">{row.agrupacioRendiment}</p>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Paq. Comanda">{formatBackendDecimal(row.paqPedido)}</DataCardField>
          <DataCardField label="Kg a Elaborar">{formatDecimal(row.kgAElaborar, 3)}</DataCardField>
          <DataCardField label="Rendiment">
            {showRendiment ? formatBackendDecimal(row.rendiment) : '—'}
          </DataCardField>
          <DataCardField
            label="Diferència"
            tone={showRendiment && isNegative(row.diferencia) ? 'negative' : 'default'}
          >
            {showRendiment ? formatBackendDecimal(row.diferencia) : '—'}
          </DataCardField>
        </DataCardGrid>
      </div>
    </DataCard>
  );
}

export default function ProductionPage() {
  const { data: catalog } = useCatalog();

  const [nombrePorcsInput, setNombrePorcsInput] = useState('1');
  const [agrupacioFilter, setAgrupacioFilter] = useState(ALL);
  const [productFilter, setProductFilter] = useState(ALL);
  // Issue #18 (Francesc, confirmada) — "sense dades = totes les dades"
  // aplica també acá: ja NO es precarrega cap default visual (abans
  // mirroreava hoy+1..hoy+7, el mateix que aplicava el backend sol quan no
  // rebia dataDes/dataFins). Els camps arrenquen buits de veritat; mentre
  // ho estiguin, `dataDes`/`dataFins` no viatgen al request — el backend
  // (canvi paral·lel de Gerardo) interpreta la seva absència com "sense
  // filtre de data", no com "aplica el teu propi default".
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Mode LOCAL (filtrant `catalog` ja carregat), mateix criteri que
  // Producte a OrderForm.tsx: GET /productes?cerca= fa coincidència EXACTA
  // a propòsit (regla 3.1 — "lomo" no ha de portar "cabeza de lomo"), no
  // serveix per a cerca incremental — ver lib/productSearch.ts.
  const productId = useMemo(
    () =>
      productFilter !== ALL
        ? (catalog.find((product) => product.descripcio === productFilter)?.id ?? null)
        : null,
    [productFilter, catalog],
  );
  const loadProductOptions = useMemo(
    () => (query: string) =>
      Promise.resolve(
        catalog
          .filter((product) => matchesProductQuery(product, query))
          .slice(0, MAX_LOCAL_COMBOBOX_RESULTS)
          .map((product) => ({ id: product.id, label: product.descripcio })),
      ),
    [catalog],
  );

  // nombrePorcs és obligatori pel backend (400 sense ell) — mai s'envia
  // un default inventat des del frontend (el "12" del mockup no tenia cap
  // suport real, ver informe d'investigació). Mentre el camp estigui buit
  // o no sigui > 0, el hook no dispara cap fetch (isReady).
  const nombrePorcs = nombrePorcsInput.trim() === '' ? null : Number(nombrePorcsInput);
  const nombrePorcsValid = nombrePorcs !== null && Number.isFinite(nombrePorcs) && nombrePorcs > 0;
  // El backend ja rebutja ≤0 amb 400 — acá es talla abans de disparar cap
  // fetch i es mostra un missatge concret vora el camp, en comptes de
  // deixar que arribi l'error genèric del backend. El camp buit es tracta
  // exactament igual que 0/negatiu: sense fetch, mateix missatge.
  const nombrePorcsError = !nombrePorcsValid ? 'El mínim és 1.' : null;

  const filters = useMemo(
    () => ({
      nombrePorcs: nombrePorcsValid ? nombrePorcs : null,
      ...(agrupacioFilter !== ALL ? { agrupacioRendiment: agrupacioFilter } : {}),
      ...(productFilter !== ALL ? { producte: productFilter } : {}),
      // Issue #18 — buit = sense filtre de data, es manda tal qual el
      // backend un cop Gerardo apliqui el seu costat (ver comentari a
      // dateFrom/dateTo més amunt). Ja no fa falta cap flag "touched": el
      // propi valor (buit o no) ja diu tot el que cal.
      ...(dateFrom ? { dataDes: dateFrom } : {}),
      ...(dateTo ? { dataFins: dateTo } : {}),
    }),
    [nombrePorcsValid, nombrePorcs, agrupacioFilter, productFilter, dateFrom, dateTo],
  );

  const { data, totals, paginacio, setPagina, isLoading, error, refetch, isReady } =
    useProductionPanell(filters);

  // Issue #20 — la condició és el filtre ACTIU, no l'agrupacioRendiment de
  // cada fila (només coincideixen quan el filtre no és 'Totes').
  const showTopCards = agrupacioFilter === ALL || agrupacioFilter === 'MAGRE';
  const showRowRendimentValues = showRowRendiment(agrupacioFilter);

  function clearFilters() {
    setAgrupacioFilter(ALL);
    setProductFilter(ALL);
    setDateFrom('');
    setDateTo('');
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
              <p className="mt-1 text-lg font-bold text-gray-900">
                {formatDecimal(totals?.kgJamon ?? null, 3)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">KG Retalls</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {formatDecimal(totals?.kgRecortes ?? null, 3)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">KG Espatlles</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {formatDecimal(totals?.kgPaletillas ?? null, 3)}
              </p>
            </div>
          </div>
        </div>

        {/* Issue #20 (Francesc, confirmat) — aquests 3 totals només tenen
            sentit quan el dataset pot incloure files MAGRE (és l'única
            agrupació que alimenta totalKgMagro): filtrant per KG o PAQ es
            queden en 0 sempre, no perquè no hi hagi magre, sinó perquè el
            propi filtre ja les va excloure — mostrar-ho seria enganyós. */}
        {showTopCards && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="TOTAL KG A ELABORAR"
                value={formatDecimal(totals?.totalKgAElaborar ?? null, 3)}
              />
              <StatCard
                label="TOTAL KG MAGRE"
                value={formatDecimal(totals?.totalKgMagro ?? null, 3)}
              />
              <StatCard
                label="DIFERÈNCIA"
                value={formatDecimal(totals?.diferencia ?? null, 3)}
                alert={isNegative(totals?.diferencia ?? null)}
              />
            </div>
          </div>
        )}
      </div>

      <FilterBar>
        <SimpleDropdown
          label="Agrupació Rendiment"
          options={AGRUPACIONS_RENDIMENT}
          value={agrupacioFilter}
          onChange={setAgrupacioFilter}
          allLabel={ALL}
        />
        <AsyncCombobox
          label="Producte"
          value={productId}
          displayValue={productFilter !== ALL ? productFilter : ''}
          placeholder="Cercar producte..."
          debounceMs={0}
          loadOptions={loadProductOptions}
          onChange={(option) => setProductFilter(option?.label ?? ALL)}
        />
        <DateInput label="Data producció des de" value={dateFrom} onChange={setDateFrom} />
        <DateInput label="Data producció fins a" value={dateTo} onChange={setDateTo} />
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
          <p className="text-sm text-red-600">
            No s&apos;han pogut carregar les dades: {error.message}
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

      {isReady && !isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 md:hidden">
            {data.map((row) => (
              <ProductionCard
                key={`${row.agrupacioProduccio}-${row.agrupacioRendiment}`}
                row={row}
                showRendiment={showRowRendimentValues}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block">
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
                  <th className="w-[16%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Rendiment
                  </th>
                  <th className="w-[17%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Diferència
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <ProductionRow
                    key={`${row.agrupacioProduccio}-${row.agrupacioRendiment}`}
                    row={row}
                    showRendiment={showRowRendimentValues}
                  />
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
