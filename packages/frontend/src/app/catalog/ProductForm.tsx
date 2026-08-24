"use client";

import { useState } from "react";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import { useCategories } from "@/hooks/useCategories";
import type { ProductApi } from "@/lib/api";

const STATUS_OPTIONS = ["Actiu", "Inactiu"];
const FORMAT_OPTIONS = ["SENCER", "TALLAT"];
const PACKAGING_OPTIONS = ["NORMAL", "ESPECIAL", "NORMAL (web)", "NORMAL (pes)"];
const NO_CATEGORY = "Selecciona...";

export function ProductForm({
  initialData,
  onSave,
  onCancel,
}: {
  initialData?: ProductApi;
  onSave: (values: ProductApi) => void;
  onCancel: () => void;
}) {
  const { data: categories } = useCategories();
  const [code, setCode] = useState(initialData?.code ?? "");
  const [productionGroup, setProductionGroup] = useState(initialData?.productionGroup ?? "");
  const [status, setStatus] = useState<string>(initialData?.status ?? "Actiu");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [category, setCategory] = useState(initialData?.category ?? NO_CATEGORY);
  const [format, setFormat] = useState(initialData?.format ?? "SENCER");
  const [packaging, setPackaging] = useState(initialData?.packaging ?? "NORMAL");
  const [weightKg, setWeightKg] = useState(initialData?.weightKg ?? 0);
  const [basePrice, setBasePrice] = useState(initialData?.basePrice ?? 0);

  const canSave = code.trim() !== "" && description.trim() !== "";

  function handleSave() {
    if (!canSave) return;
    onSave({
      code: code.trim(),
      productionGroup: productionGroup.trim(),
      status: status as ProductApi["status"],
      description: description.trim(),
      category: category === NO_CATEGORY ? "" : category,
      format,
      packaging,
      weightKg,
      basePrice,
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Codi de producte" value={code} onChange={(event) => setCode(event.target.value)} />
          <TextField
            label="Agrupació producció"
            value={productionGroup}
            onChange={(event) => setProductionGroup(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectFilter label="Estat" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </div>

        <TextField label="Descripció" value={description} onChange={(event) => setDescription(event.target.value)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectFilter
            label="Categoria"
            options={[NO_CATEGORY, ...categories.map((item) => item.name)]}
            value={category}
            onChange={setCategory}
          />
          <SelectFilter label="Format" options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectFilter label="Envasat" options={PACKAGING_OPTIONS} value={packaging} onChange={setPackaging} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Pes (kg)"
            type="number"
            step="0.001"
            value={weightKg}
            onChange={(event) => setWeightKg(Number(event.target.value))}
          />
          <TextField
            label="Preu base (€)"
            type="number"
            step="0.01"
            value={basePrice}
            onChange={(event) => setBasePrice(Number(event.target.value))}
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
