"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataCard, DataCardActions, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useCatalog } from "@/hooks/useCatalog";
import type { ProductApi } from "@/lib/api";

const ALL = "Tots";
const ALL_FEM = "Totes";

function formatPrice(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function formatWeight(value: number) {
  return value.toFixed(3).replace(".", ",");
}

function distinct(values: string[]) {
  return Array.from(new Set(values));
}

function CatalogCard({ product, onEdit }: { product: ProductApi; onEdit: () => void }) {
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{product.code}</p>
          <p className="text-sm text-gray-500">{product.description}</p>
        </div>
        <Badge variant={product.status === "Actiu" ? "positive" : "neutral"}>{product.status}</Badge>
      </div>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Categoria">{product.category}</DataCardField>
          <DataCardField label="Agrupació producció">{product.productionGroup}</DataCardField>
          <DataCardField label="Format">{product.format}</DataCardField>
          <DataCardField label="Envasat">{product.packaging}</DataCardField>
          <DataCardField label="Pes (kg)">{formatWeight(product.weightKg)}</DataCardField>
          <DataCardField label="Preu base">{formatPrice(product.basePrice)}</DataCardField>
        </DataCardGrid>
      </div>

      <DataCardActions>
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Editar producte
        </button>
      </DataCardActions>
    </DataCard>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const { data, isLoading, error } = useCatalog();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_FEM);
  const [productionGroup, setProductionGroup] = useState(ALL);
  const [format, setFormat] = useState(ALL);
  const [packaging, setPackaging] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const categoryOptions = useMemo(() => [ALL_FEM, ...distinct(data.map((product) => product.category))], [data]);
  const productionGroupOptions = useMemo(
    () => [ALL, ...distinct(data.map((product) => product.productionGroup))],
    [data],
  );
  const formatOptions = useMemo(() => [ALL, ...distinct(data.map((product) => product.format))], [data]);
  const packagingOptions = useMemo(() => [ALL, ...distinct(data.map((product) => product.packaging))], [data]);
  const statusOptions = useMemo(() => [ALL, ...distinct(data.map((product) => product.status))], [data]);

  const filtered = data.filter((product) => {
    if (search && !product.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== ALL_FEM && product.category !== category) return false;
    if (productionGroup !== ALL && product.productionGroup !== productionGroup) return false;
    if (format !== ALL && product.format !== format) return false;
    if (packaging !== ALL && product.packaging !== packaging) return false;
    if (status !== ALL && product.status !== status) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Catàleg"
        subtitle="Manteniment del catàleg de productes."
        action={{
          label: "Nou producte",
          icon: <Plus className="h-4 w-4" />,
          onClick: () => router.push("/catalog/new"),
        }}
      />

      <FilterBar>
        <SearchInput label="Cerca descripció" value={search} onChange={setSearch} />
        <SelectFilter label="Categoria" options={categoryOptions} value={category} onChange={setCategory} />
        <SelectFilter
          label="Agrupació producció"
          options={productionGroupOptions}
          value={productionGroup}
          onChange={setProductionGroup}
        />
        <SelectFilter label="Format" options={formatOptions} value={format} onChange={setFormat} />
        <SelectFilter label="Envasat" options={packagingOptions} value={packaging} onChange={setPackaging} />
        <SelectFilter label="Estat" options={statusOptions} value={status} onChange={setStatus} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;ha pogut carregar el catàleg.</p>}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {filtered.map((product) => (
              <CatalogCard
                key={product.code}
                product={product}
                onEdit={() => router.push(`/catalog/${product.code}/edit`)}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[12%] px-2 py-2 text-left font-medium text-gray-500 break-words">Categoria</th>
                  <th className="w-[12%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Agrupació producció
                  </th>
                  <th className="w-[10%] px-2 py-2 text-left font-medium text-gray-500 break-words">Codi</th>
                  <th className="w-[20%] px-2 py-2 text-left font-medium text-gray-500 break-words">Descripció</th>
                  <th className="w-[8%] px-2 py-2 text-left font-medium text-gray-500 break-words">Format</th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">Envasat</th>
                  <th className="w-[8%] px-2 py-2 text-right font-medium text-gray-500 break-words">Pes (kg)</th>
                  <th className="w-[9%] px-2 py-2 text-right font-medium text-gray-500 break-words">Preu base</th>
                  <th className="w-[7%] px-2 py-2 text-left font-medium text-gray-500 break-words">Estat</th>
                  <th className="w-[5%] px-2 py-2 text-right font-medium text-gray-500 break-words">Accions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.code} className="border-b border-gray-100 last:border-0">
                    <td className="px-2 py-3 break-words text-gray-900">{product.category}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{product.productionGroup}</td>
                    <td className="px-2 py-3 break-words">
                      <span className="font-semibold text-gray-900">{product.code}</span>
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{product.description}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{product.format}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{product.packaging}</td>
                    <td className="px-2 py-3 text-right text-gray-900">{formatWeight(product.weightKg)}</td>
                    <td className="px-2 py-3 text-right text-gray-900">{formatPrice(product.basePrice)}</td>
                    <td className="px-2 py-3 break-words">
                      <Badge variant={product.status === "Actiu" ? "positive" : "neutral"}>{product.status}</Badge>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="flex justify-end">
                        <IconButton
                          variant="edit"
                          label="Editar producte"
                          onClick={() => router.push(`/catalog/${product.code}/edit`)}
                        />
                      </div>
                    </td>
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
