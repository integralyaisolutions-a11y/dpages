"use client";

import { useMemo, useState } from "react";
import { EditableCell } from "@/components/ui/EditableCell";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useEditableRow } from "@/hooks/useEditableRow";
import { useRates } from "@/hooks/useRates";
import type { ProductRateApi, TariffApi } from "@/lib/api";
import { TariffFormModal } from "./TariffFormModal";

const ALL = "Tots";
const ALL_FEM = "Totes";

// Columnes fixes (esquerra) queden "sticky": no es desplacen amb el scroll
// horitzontal, que només afecta les columnes de tarifa i Guardar (poden
// créixer amb "Nova tarifa"). És l'únic lloc del projecte on el scroll
// horitzontal contingut és la solució correcta en lloc de tarjetes, perquè
// el nombre de columnes és dinàmic.
const CATEGORIA_WIDTH = 110;
const FORMAT_WIDTH = 90;
const CODI_WIDTH = 100;
const DESCRIPCIO_WIDTH = 160;
const GUARDAR_WIDTH = 90;
const TARIFF_COLUMN_WIDTH = 110;

const FORMAT_LEFT = CATEGORIA_WIDTH;
const CODI_LEFT = FORMAT_LEFT + FORMAT_WIDTH;
const DESCRIPCIO_LEFT = CODI_LEFT + CODI_WIDTH;

const STICKY_LEFT_SHADOW = "shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)]";

function distinct(values: string[]) {
  return Array.from(new Set(values));
}

function RateProductRow({
  product,
  tariffColumns,
  onSave,
}: {
  product: ProductRateApi;
  tariffColumns: TariffApi[];
  onSave: (productCode: string, prices: Record<string, number | null>) => void;
}) {
  const initialPrices = useMemo(() => {
    const entries: Record<string, number | null> = {};
    for (const tariff of tariffColumns) entries[tariff.code] = product.prices[tariff.code] ?? null;
    return entries;
  }, [product, tariffColumns]);

  const { draft, setField, save, isDirty } = useEditableRow(initialPrices, (prices) =>
    onSave(product.productCode, prices),
  );

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td
        className="sticky left-0 z-10 bg-white px-2 py-3 break-words text-gray-900"
        style={{ width: CATEGORIA_WIDTH }}
      >
        {product.category}
      </td>
      <td className="sticky z-10 bg-white px-2 py-3 break-words text-gray-900" style={{ left: FORMAT_LEFT, width: FORMAT_WIDTH }}>
        {product.format}
      </td>
      <td className="sticky z-10 bg-white px-2 py-3 break-words" style={{ left: CODI_LEFT, width: CODI_WIDTH }}>
        <span className="font-semibold text-gray-900">{product.productCode}</span>
      </td>
      <td
        className={`sticky z-10 bg-white px-2 py-3 break-words text-gray-900 ${STICKY_LEFT_SHADOW}`}
        style={{ left: DESCRIPCIO_LEFT, width: DESCRIPCIO_WIDTH }}
      >
        {product.description}
      </td>
      {tariffColumns.map((tariff) => (
        <td key={tariff.code} className="px-1 py-3 text-right" style={{ width: TARIFF_COLUMN_WIDTH }}>
          <EditableCell value={draft[tariff.code] ?? null} onChange={(value) => setField(tariff.code, value)} />
        </td>
      ))}
      <td className="px-2 py-3 text-center" style={{ width: GUARDAR_WIDTH }}>
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

export default function RatesPage() {
  const { data, tariffColumns, isLoading, error, updatePrices, createTariff } = useRates();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_FEM);
  const [format, setFormat] = useState(ALL);

  const tableWidth =
    CATEGORIA_WIDTH + FORMAT_WIDTH + CODI_WIDTH + DESCRIPCIO_WIDTH + tariffColumns.length * TARIFF_COLUMN_WIDTH + GUARDAR_WIDTH;

  const categoryOptions = useMemo(() => [ALL_FEM, ...distinct(data.map((product) => product.category))], [data]);
  const formatOptions = useMemo(() => [ALL, ...distinct(data.map((product) => product.format))], [data]);

  const filtered = data.filter((product) => {
    if (search && !product.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== ALL_FEM && product.category !== category) return false;
    if (format !== ALL && product.format !== format) return false;
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
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar les tarifes.</p>}

      {!isLoading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="text-sm" style={{ width: tableWidth, tableLayout: "fixed", borderCollapse: "collapse" }}>
            <thead className="border-b border-gray-200">
              <tr>
                <th
                  className="sticky left-0 z-20 bg-white px-2 py-2 text-left font-medium text-gray-500 break-words"
                  style={{ width: CATEGORIA_WIDTH }}
                >
                  Categoria
                </th>
                <th
                  className="sticky z-20 bg-white px-2 py-2 text-left font-medium text-gray-500 break-words"
                  style={{ left: FORMAT_LEFT, width: FORMAT_WIDTH }}
                >
                  Format
                </th>
                <th
                  className="sticky z-20 bg-white px-2 py-2 text-left font-medium text-gray-500 break-words"
                  style={{ left: CODI_LEFT, width: CODI_WIDTH }}
                >
                  Codi Producte
                </th>
                <th
                  className={`sticky z-20 bg-white px-2 py-2 text-left font-medium text-gray-500 break-words ${STICKY_LEFT_SHADOW}`}
                  style={{ left: DESCRIPCIO_LEFT, width: DESCRIPCIO_WIDTH }}
                >
                  Descripció
                </th>
                {tariffColumns.map((tariff) => (
                  <th
                    key={tariff.code}
                    className="px-1 py-2 text-right font-medium text-gray-500 break-words"
                    style={{ width: TARIFF_COLUMN_WIDTH }}
                  >
                    {tariff.name}
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
                  key={product.productCode}
                  product={product}
                  tariffColumns={tariffColumns}
                  onSave={updatePrices}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TariffFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(code, name) => {
          createTariff(code, name);
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}
