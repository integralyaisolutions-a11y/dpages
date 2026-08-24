"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/DataTable";
import { useCatalog } from "@/hooks/useCatalog";

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
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Categoria</TableHeaderCell>
              <TableHeaderCell>Agrupació producció</TableHeaderCell>
              <TableHeaderCell>Codi</TableHeaderCell>
              <TableHeaderCell>Descripció</TableHeaderCell>
              <TableHeaderCell>Format</TableHeaderCell>
              <TableHeaderCell>Envasat</TableHeaderCell>
              <TableHeaderCell align="right">Pes (kg)</TableHeaderCell>
              <TableHeaderCell align="right">Preu base</TableHeaderCell>
              <TableHeaderCell>Estat</TableHeaderCell>
              <TableHeaderCell align="right">Accions</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {filtered.map((product) => (
              <TableRow key={product.code}>
                <TableCell>{product.category}</TableCell>
                <TableCell>{product.productionGroup}</TableCell>
                <TableCell>
                  <span className="font-semibold text-gray-900">{product.code}</span>
                </TableCell>
                <TableCell>{product.description}</TableCell>
                <TableCell>{product.format}</TableCell>
                <TableCell>{product.packaging}</TableCell>
                <TableCell align="right">{formatWeight(product.weightKg)}</TableCell>
                <TableCell align="right">{formatPrice(product.basePrice)}</TableCell>
                <TableCell>
                  <Badge variant={product.status === "Actiu" ? "positive" : "neutral"}>{product.status}</Badge>
                </TableCell>
                <TableCell align="right">
                  <div className="flex justify-end">
                    <IconButton
                      variant="edit"
                      label="Editar producte"
                      onClick={() => router.push(`/catalog/${product.code}/edit`)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
