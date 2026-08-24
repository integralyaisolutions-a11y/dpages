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

const CATEGORIA_WIDTH = 11;
const FORMAT_WIDTH = 9;
const CODI_WIDTH = 9;
const DESCRIPCIO_WIDTH = 14;
const GUARDAR_WIDTH = 9;
const FIXED_WIDTH = CATEGORIA_WIDTH + FORMAT_WIDTH + CODI_WIDTH + DESCRIPCIO_WIDTH + GUARDAR_WIDTH;

function distinct(values: string[]) {
  return Array.from(new Set(values));
}

function tariffColumnWidth(tariffCount: number) {
  return (100 - FIXED_WIDTH) / Math.max(tariffCount, 1);
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
      <td className="px-2 py-3 break-words text-gray-900">{product.category}</td>
      <td className="px-2 py-3 break-words text-gray-900">{product.format}</td>
      <td className="px-2 py-3 break-words">
        <span className="font-semibold text-gray-900">{product.productCode}</span>
      </td>
      <td className="px-2 py-3 break-words text-gray-900">{product.description}</td>
      {tariffColumns.map((tariff) => (
        <td key={tariff.code} className="px-1 py-3 text-right">
          <EditableCell value={draft[tariff.code] ?? null} onChange={(value) => setField(tariff.code, value)} />
        </td>
      ))}
      <td className="px-2 py-3 text-center">
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
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-gray-500" style={{ width: `${CATEGORIA_WIDTH}%` }}>
                  Categoria
                </th>
                <th className="px-2 py-2 text-left font-medium text-gray-500" style={{ width: `${FORMAT_WIDTH}%` }}>
                  Format
                </th>
                <th className="px-2 py-2 text-left font-medium text-gray-500" style={{ width: `${CODI_WIDTH}%` }}>
                  Codi Producte
                </th>
                <th
                  className="px-2 py-2 text-left font-medium text-gray-500"
                  style={{ width: `${DESCRIPCIO_WIDTH}%` }}
                >
                  Descripció
                </th>
                {tariffColumns.map((tariff) => (
                  <th
                    key={tariff.code}
                    className="px-1 py-2 text-right font-medium text-gray-500 break-words"
                    style={{ width: `${tariffColumnWidth(tariffColumns.length)}%` }}
                  >
                    {tariff.name}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium text-gray-500" style={{ width: `${GUARDAR_WIDTH}%` }}>
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
