"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import { useCatalog } from "@/hooks/useCatalog";
import type { RendimentPorcEntradaApi } from "@/lib/api";
import { parseDecimalInput } from "@/lib/decimals";

const PLACEHOLDER = "Selecciona...";

function productLabel(product: { id: number; codi: string | null; descripcio: string }) {
  return `${product.codi ?? product.id} · ${product.descripcio}`;
}

export function PigYieldFormModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: RendimentPorcEntradaApi) => void;
}) {
  const { data: products } = useCatalog();

  const productOptions = useMemo(() => products.map((product) => productLabel(product)), [products]);

  const [productLabelValue, setProductLabelValue] = useState(PLACEHOLDER);
  const [unitsPerPig, setUnitsPerPig] = useState("");
  const [kgPerUnit, setKgPerUnit] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find((product) => productLabel(product) === productLabelValue);

  function handleSave() {
    if (!selectedProduct) {
      setError("Selecciona un producte.");
      return;
    }
    onSave({
      producteId: selectedProduct.id,
      unitatsPerPorc: parseDecimalInput(unitsPerPig, 2),
      kgPerUnitat: parseDecimalInput(kgPerUnit, 3),
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova línia">
      <div className="flex flex-col gap-4">
        <SelectFilter
          label="Producte"
          options={[PLACEHOLDER, ...productOptions]}
          value={productLabelValue}
          onChange={setProductLabelValue}
        />
        {/* Agrupació Rendiment / Categoria / Agrupació Producció ya no se
            eligen a mano: el backend real las deriva del producte (contrato
            §4.9, sólo lectura en esta ficha) — se muestran acá una vez
            elegido el producte, sólo para confirmar visualmente. */}
        {selectedProduct && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <p>Categoria: {selectedProduct.categoria?.nom ?? "—"}</p>
            <p>Agrupació producció: {selectedProduct.agrupacioProduccio ?? "—"}</p>
          </div>
        )}
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
