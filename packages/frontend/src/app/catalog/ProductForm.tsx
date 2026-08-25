"use client";

import { useState } from "react";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import { useCategories } from "@/hooks/useCategories";
import type { ProducteApi } from "@/lib/api";
import { parseDecimalInput } from "@/lib/decimals";

const STATUS_OPTIONS = ["Actiu", "Inactiu"];
const FORMAT_OPTIONS = ["SENCER", "TALLAT"];
const PACKAGING_OPTIONS = ["NORMAL", "ESPECIAL", "NORMAL (web)", "NORMAL (pes)"];
const NO_CATEGORY = "Selecciona...";

type ProductFormValues = Omit<ProducteApi, "id">;

export function ProductForm({
  initialData,
  onSave,
  onCancel,
}: {
  initialData?: ProducteApi;
  onSave: (values: ProductFormValues) => void;
  onCancel: () => void;
}) {
  const { data: categories } = useCategories();
  const [codi, setCodi] = useState(initialData?.codi ?? "");
  const [agrupacioProduccio, setAgrupacioProduccio] = useState(initialData?.agrupacioProduccio ?? "");
  const [actiu, setActiu] = useState<string>(initialData?.actiu === false ? "Inactiu" : "Actiu");
  const [descripcio, setDescripcio] = useState(initialData?.descripcio ?? "");
  const [categoriaNom, setCategoriaNom] = useState(initialData?.categoria?.nom ?? NO_CATEGORY);
  const [format, setFormat] = useState<ProducteApi["format"]>(initialData?.format ?? "SENCER");
  const [envasat, setEnvasat] = useState<ProducteApi["envasat"]>(initialData?.envasat ?? "NORMAL");
  const [pesKg, setPesKg] = useState(initialData?.pesKg !== null ? (initialData?.pesKg ?? "0") : "0");
  const [preuVenda, setPreuVenda] = useState(initialData?.preuVenda ?? "0");

  const canSave = codi.trim() !== "" && descripcio.trim() !== "";

  function handleSave() {
    if (!canSave) return;
    const categoria = categories.find((item) => item.nom === categoriaNom) ?? null;
    onSave({
      codi: codi.trim(),
      descripcio: descripcio.trim(),
      descripcioVenda: initialData?.descripcioVenda ?? null,
      tipus: initialData?.tipus ?? "simple",
      agrupacioProduccio: agrupacioProduccio.trim() || null,
      actiu: actiu === "Actiu",
      categoria: categoria ? { id: categoria.id, nom: categoria.nom } : null,
      format,
      envasat,
      pesKg: Number(pesKg) > 0 ? parseDecimalInput(pesKg, 3) : null,
      preuVenda: Number(preuVenda) > 0 ? parseDecimalInput(preuVenda, 2) : null,
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Codi de producte" value={codi} onChange={(event) => setCodi(event.target.value)} />
          <TextField
            label="Agrupació producció"
            value={agrupacioProduccio}
            onChange={(event) => setAgrupacioProduccio(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectFilter label="Estat" options={STATUS_OPTIONS} value={actiu} onChange={setActiu} />
        </div>

        <TextField label="Descripció" value={descripcio} onChange={(event) => setDescripcio(event.target.value)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectFilter
            label="Categoria"
            options={[NO_CATEGORY, ...categories.map((item) => item.nom)]}
            value={categoriaNom}
            onChange={setCategoriaNom}
          />
          <SelectFilter
            label="Format"
            options={FORMAT_OPTIONS}
            value={format ?? FORMAT_OPTIONS[0]}
            onChange={(value) => setFormat(value as ProducteApi["format"])}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectFilter
            label="Envasat"
            options={PACKAGING_OPTIONS}
            value={envasat ?? PACKAGING_OPTIONS[0]}
            onChange={(value) => setEnvasat(value as ProducteApi["envasat"])}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Pes (kg)"
            type="number"
            step="0.001"
            value={pesKg}
            onChange={(event) => setPesKg(event.target.value)}
          />
          <TextField
            label="Preu base (€)"
            type="number"
            step="0.01"
            value={preuVenda}
            onChange={(event) => setPreuVenda(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-6">
        <button type="button" onClick={onCancel} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold ${
            canSave ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          Desar
        </button>
      </div>
    </div>
  );
}
