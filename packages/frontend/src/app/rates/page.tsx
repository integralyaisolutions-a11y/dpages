"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EditableCell } from "@/components/ui/EditableCell";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useCatalog } from "@/hooks/useCatalog";
import { useEditableRow } from "@/hooks/useEditableRow";
import { type CellSaveResult, useRates } from "@/hooks/useRates";
import type { FilaMatriuTarifesApi, TarifaResumApi } from "@/lib/api";
import { parseDecimalInput } from "@/lib/decimals";
import { TariffFormModal } from "./TariffFormModal";

const ALL = "Tots";
const ALL_FEM = "Totes";

// Descripció és l'ÚNICA columna fixa ("sticky"): no es desplaça amb el
// scroll horitzontal. Categoria, Format i Codi Producte ara scrollegen
// juntes amb les columnes de tarifa i "Guardar" (mateix tractament que
// abans tenien només elles). És l'únic lloc del projecte on el scroll
// horitzontal contingut és la solució correcta en lloc de tarjetes, perquè
// el nombre de columnes és dinàmic.
//
// Descripció va PRIMERA (abans de Categoria/Format/Codi) perquè és
// l'única sticky — un sticky no-primer "salta" a l'esquerra en quant
// l'usuari comença a scrollejar, en lloc de quedar-se on ja estava.
//
// Pressupost real a 320px (abans deixava només ~18px lliures, insuficient
// per percebre cap columna de tarifa — ver informe d'investigació):
//   320 viewport − 48 padding de <main> (px-6×2) − ~2 border del
//   contenidor de scroll = 270px disponibles.
//   270 − 150 (DESCRIPCIO_WIDTH_MOBILE) = 120px lliures per la propera
//   columna scrollejable — molt per sobre del mínim de 25-30px demanat.
const CATEGORIA_WIDTH = 110;
const FORMAT_WIDTH = 90;
const CODI_WIDTH = 100;
const DESCRIPCIO_WIDTH_DESKTOP = 160;
const DESCRIPCIO_WIDTH_MOBILE = 150;

const GUARDAR_WIDTH = 90;
const TARIFF_COLUMN_WIDTH = 110;

const MOBILE_BREAKPOINT_QUERY = "(max-width: 639px)";

const STICKY_LEFT_SHADOW = "shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)]";

function useIsMobileWidth() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

function distinct(values: string[]) {
  return Array.from(new Set(values));
}

function useDescripcioWidth(): number {
  const isMobile = useIsMobileWidth();
  return isMobile ? DESCRIPCIO_WIDTH_MOBILE : DESCRIPCIO_WIDTH_DESKTOP;
}

function RateProductRow({
  product,
  category,
  format,
  tariffColumns,
  descripcioWidth,
  onSave,
}: {
  product: FilaMatriuTarifesApi;
  category: string;
  format: string;
  tariffColumns: TarifaResumApi[];
  descripcioWidth: number;
  onSave: (producteId: number, changes: Record<string, string>, deletions: string[]) => Promise<CellSaveResult[]>;
}) {
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const initialPrices = useMemo(() => {
    const entries: Record<string, number | null> = {};
    for (const tariff of tariffColumns) {
      const raw = product.preus[String(tariff.id)] ?? null;
      entries[String(tariff.id)] = raw === null ? null : Number(raw);
    }
    return entries;
  }, [product, tariffColumns]);

  const { draft, setField, save, isDirty } = useEditableRow(initialPrices, async (prices) => {
    // PATCH para las celdas que cambiaron a un valor no vacío; DELETE (capa
    // 28) para las que tenían precio y el usuario vació — ninguna de las
    // dos toca las celdas sin cambios reales.
    const changes: Record<string, string> = {};
    const deletions: string[] = [];
    for (const [tarifaId, value] of Object.entries(prices)) {
      const original = initialPrices[tarifaId] ?? null;
      if (value === original) continue;
      if (value === null) {
        if (original !== null) deletions.push(tarifaId);
        continue;
      }
      changes[tarifaId] = parseDecimalInput(value, 2);
    }
    if (Object.keys(changes).length === 0 && deletions.length === 0) return;

    setIsSaving(true);
    setCellErrors({});
    const results = await onSave(product.producteId, changes, deletions);
    setIsSaving(false);

    const failures: Record<string, string> = {};
    for (const result of results) {
      if (!result.success) failures[result.tarifaId] = result.error.message;
    }
    setCellErrors(failures);
  });

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td
        className={`sticky left-0 z-10 bg-white px-2 py-3 break-words text-gray-900 ${STICKY_LEFT_SHADOW}`}
        style={{ width: descripcioWidth }}
      >
        {product.descripcio}
      </td>
      <td className="px-2 py-3 break-words text-gray-900" style={{ width: CATEGORIA_WIDTH }}>
        {category}
      </td>
      <td className="px-2 py-3 break-words text-gray-900" style={{ width: FORMAT_WIDTH }}>
        {format}
      </td>
      <td className="px-2 py-3 break-words" style={{ width: CODI_WIDTH }}>
        <span className="font-semibold text-gray-900">{product.codi}</span>
      </td>
      {tariffColumns.map((tariff) => (
        <td key={tariff.id} className="px-1 py-3 text-right align-top" style={{ width: TARIFF_COLUMN_WIDTH }}>
          <EditableCell
            value={draft[String(tariff.id)] ?? null}
            onChange={(value) => setField(String(tariff.id), value)}
          />
          {cellErrors[String(tariff.id)] && (
            <p className="mt-1 text-right text-xs text-red-600">{cellErrors[String(tariff.id)]}</p>
          )}
        </td>
      ))}
      <td className="px-2 py-3 text-center" style={{ width: GUARDAR_WIDTH }}>
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || isSaving}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            isDirty && !isSaving ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          {isSaving ? "Guardant..." : "Guardar"}
        </button>
      </td>
    </tr>
  );
}

export default function RatesPage() {
  const { data, tariffColumns, isLoading, error, refetch, savePrices, createTariff } = useRates();
  const { data: catalog } = useCatalog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_FEM);
  const [format, setFormat] = useState(ALL);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const descripcioWidth = useDescripcioWidth();

  const tableWidth =
    descripcioWidth +
    CATEGORIA_WIDTH +
    FORMAT_WIDTH +
    CODI_WIDTH +
    tariffColumns.length * TARIFF_COLUMN_WIDTH +
    GUARDAR_WIDTH;

  useEffect(() => {
    if (!scrollContainer) return;
    function updateCanScrollRight() {
      if (!scrollContainer) return;
      const remaining = scrollContainer.scrollWidth - scrollContainer.scrollLeft - scrollContainer.clientWidth;
      setCanScrollRight(remaining > 1);
    }
    updateCanScrollRight();
    scrollContainer.addEventListener("scroll", updateCanScrollRight);
    window.addEventListener("resize", updateCanScrollRight);
    return () => {
      scrollContainer.removeEventListener("scroll", updateCanScrollRight);
      window.removeEventListener("resize", updateCanScrollRight);
    };
    // tableWidth canvia quan es filtra/afegeix una tarifa; cal recalcular si hi ha més scroll disponible.
  }, [scrollContainer, tableWidth]);

  // FilaMatriuTarifesApi (contrato §4.3) no trae categoria/format: la matriz
  // de tarifas sólo expone producteId/codi/descripcio/preus. Se derivan acá
  // cruzando por producteId contra el catàleg (useCatalog) en vez de
  // duplicar el dato a mano, como hacía el mock viejo (ver AUDITORIA_FRONTEND.md
  // §4). Con los datos de ejemplo de hoy la mayoría no cruza (mocks/rates.ts
  // usa otro conjunto de SKUs que mocks/catalog.ts, gap documentado ahí) y
  // queda en "—" — eso es correcto, no un bug de este cruce.
  const categoryByProductId = useMemo(() => {
    const map = new Map<number, string>();
    for (const product of catalog) map.set(product.id, product.categoria?.nom ?? "—");
    return map;
  }, [catalog]);
  const formatByProductId = useMemo(() => {
    const map = new Map<number, string>();
    for (const product of catalog) map.set(product.id, product.format ?? "—");
    return map;
  }, [catalog]);

  const categoryOptions = useMemo(
    () => [ALL_FEM, ...distinct(data.map((product) => categoryByProductId.get(product.producteId) ?? "—"))],
    [data, categoryByProductId],
  );
  const formatOptions = useMemo(
    () => [ALL, ...distinct(data.map((product) => formatByProductId.get(product.producteId) ?? "—"))],
    [data, formatByProductId],
  );

  const filtered = data.filter((product) => {
    if (search && !product.descripcio.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== ALL_FEM && (categoryByProductId.get(product.producteId) ?? "—") !== category) return false;
    if (format !== ALL && (formatByProductId.get(product.producteId) ?? "—") !== format) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Llistat de Tarifes"
        subtitle="Preus dels productes per cada tarifa. Edita les cel·les i prem Guardar a la fila."
        action={{ label: "Nova tarifa", onClick: () => setIsModalOpen(true) }}
      />

      <FilterBar>
        <SearchInput label="Cerca descripció" value={search} onChange={setSearch} />
        <SelectFilter label="Categoria" options={categoryOptions} value={category} onChange={setCategory} />
        <SelectFilter label="Format" options={formatOptions} value={format} onChange={setFormat} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;han pogut carregar les tarifes: {error.message}</p>
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
        <div className="relative">
          <div ref={setScrollContainer} className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="text-sm" style={{ width: tableWidth, tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead className="border-b border-gray-200">
                <tr>
                  <th
                    className={`sticky left-0 z-20 bg-white px-2 py-2 text-left font-medium text-gray-500 break-words ${STICKY_LEFT_SHADOW}`}
                    style={{ width: descripcioWidth }}
                  >
                    Descripció
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 break-words" style={{ width: CATEGORIA_WIDTH }}>
                    Categoria
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 break-words" style={{ width: FORMAT_WIDTH }}>
                    Format
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 break-words" style={{ width: CODI_WIDTH }}>
                    Codi Producte
                  </th>
                  {tariffColumns.map((tariff) => (
                    <th
                      key={tariff.id}
                      className="px-1 py-2 text-right font-medium text-gray-500 break-words"
                      style={{ width: TARIFF_COLUMN_WIDTH }}
                    >
                      {tariff.nom}
                    </th>
                  ))}
                  <th
                    className="px-2 py-2 text-center font-medium text-gray-500 break-words"
                    style={{ width: GUARDAR_WIDTH }}
                  >
                    Guardar
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <RateProductRow
                    key={product.producteId}
                    product={product}
                    category={categoryByProductId.get(product.producteId) ?? "—"}
                    format={formatByProductId.get(product.producteId) ?? "—"}
                    tariffColumns={tariffColumns}
                    descripcioWidth={descripcioWidth}
                    onSave={savePrices}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Indicador de scroll: degradat + xip amb fletxa a la vora dreta, visible
              només mentre queda contingut de tarifes per veure. Ancorat a prop de la
              capçalera (no al centre vertical) perquè sigui visible sense haver de
              fer scroll vertical, i no depèn de la posició de l'ombra sticky, que a
              mòbil pot quedar fora del viewport. */}
          {canScrollRight && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 right-0 bottom-0 flex w-12 justify-end rounded-r-xl bg-gradient-to-l from-white via-white/90 to-transparent pt-1.5 pr-1.5"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900/85 text-white shadow-sm">
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          )}
        </div>
      )}

      <TariffFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={async (code, name) => {
          await createTariff(code, name);
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}
