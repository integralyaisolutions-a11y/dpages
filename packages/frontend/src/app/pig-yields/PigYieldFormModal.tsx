"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import { useCatalog } from "@/hooks/useCatalog";
import { useCategories } from "@/hooks/useCategories";
import type { PigYieldApi } from "@/lib/api";

const PLACEHOLDER = "Selecciona...";

export function PigYieldFormModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: Omit<PigYieldApi, "id">) => void;
}) {
  const { data: categories } = useCategories();
  const { data: products } = useCatalog();

  const yieldGroupOptions = useMemo(
    () =>
      Array.from(
        new Set(categories.map((category) => category.agrupacioRendiment).filter((value): value is string => Boolean(value))),
      ),
    [categories],
  );
  const categoryOptions = useMemo(() => categories.map((category) => category.name), [categories]);
  const productionGroupOptions = useMemo(
    () => Array.from(new Set(products.map((product) => product.productionGroup))),
    [products],
  );
  const productOptions = useMemo(
    () => products.map((product) => `${product.code} · ${product.description}`),
    [products],
  );

  const [yieldGroup, setYieldGroup] = useState(PLACEHOLDER);
  const [category, setCategory] = useState(PLACEHOLDER);
  const [productionGroup, setProductionGroup] = useState(PLACEHOLDER);
  const [product, setProduct] = useState(PLACEHOLDER);
  const [unitsPerPig, setUnitsPerPig] = useState("");
  const [kgPerUnit, setKgPerUnit] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (category === PLACEHOLDER || productionGroup === PLACEHOLDER) {
      setError("Selecciona categoria i agrupació producció.");
      return;
    }
    onSave({
      category,
      productionGroup,
      unitsPerPig: Number(unitsPerPig.replace(",", ".")) || 0,
      kgPerUnit: Number(kgPerUnit.replace(",", ".")) || 0,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova línia">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <SelectFilter
            label="Agrupació Rendiment"
            options={[PLACEHOLDER, ...yieldGroupOptions]}
            value={yieldGroup}
            onChange={setYieldGroup}
          />
          <SelectFilter
            label="Categoria"
            options={[PLACEHOLDER, ...categoryOptions]}
            value={category}
            onChange={setCategory}
          />
        </div>
        <SelectFilter
          label="Agrupació Producció"
          options={[PLACEHOLDER, ...productionGroupOptions]}
          value={productionGroup}
          onChange={setProductionGroup}
        />
        <SelectFilter
          label="Producte"
          options={[PLACEHOLDER, ...productOptions]}
          value={product}
          onChange={setProduct}
        />
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <TextField
              label="Unitats per porc"
              type="number"
              step="0.01"
              value={unitsPerPig}
              onChange={(event) => setUnitsPerPig(event.target.value)}
            />
          </div>
          <div className="flex-1">
            <TextField
              label="Kg per unitat"
              type="number"
              step="0.001"
              value={kgPerUnit}
              onChange={(event) => setKgPerUnit(event.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Desar
        </button>
      </div>
    </Modal>
  );
}
