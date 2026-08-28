"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import { useCatalog } from "@/hooks/useCatalog";
import { useCategories } from "@/hooks/useCategories";
import { api, ApiError, type RendimentPorcApi, type RendimentPorcEntradaApi, type RespostaPaginada } from "@/lib/api";
import { parseDecimalInput } from "@/lib/decimals";

const PLACEHOLDER = "Selecciona...";

type FieldErrors = { producteId?: string; unitatsPerPorc?: string; kgPerUnitat?: string };

function productLabel(product: { id: number; codi: string | null; descripcio: string }) {
  return `${product.codi ?? product.id} · ${product.descripcio}`;
}

function distinct<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function PigYieldFormModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: RendimentPorcEntradaApi) => Promise<void>;
}) {
  const { data: products } = useCatalog();
  const { data: categories } = useCategories();

  // Cascada de filtres (Agrupació Rendiment → Categoria → Agrupació
  // Producció → Producte): cap dels 3 primers viatja al backend, només
  // angosten el desplegable de Producte (investigació confirmada: POST
  // /rendiments-porcs només accepta producteId/unitatsPerPorc/kgPerUnitat,
  // els altres 3 camps els deriva el backend i els ignora si es manden).
  // Cardinalitat producte→categoria→agrupacioRendiment és 1:1 (o null) a
  // cada pas (migracions 0006/0011), per això la cascada és determinista.
  const categoriaByNom = useMemo(() => new Map(categories.map((c) => [c.nom, c])), [categories]);
  // Sólo les categories amb agrupacioRendiment definit poden tenir línies de
  // rendiment (el backend rebutja la resta amb 400 VALIDACIO) — el cascade
  // només ofereix des del principi el subconjunt vàlid.
  const eligibleCategories = useMemo(() => categories.filter((c) => c.agrupacioRendiment !== null), [categories]);

  const [agrupacioRendiment, setAgrupacioRendiment] = useState(PLACEHOLDER);
  const [categoria, setCategoria] = useState(PLACEHOLDER);
  const [agrupacioProduccio, setAgrupacioProduccio] = useState(PLACEHOLDER);
  const [productLabelValue, setProductLabelValue] = useState(PLACEHOLDER);
  const [unitsPerPig, setUnitsPerPig] = useState("");
  const [kgPerUnit, setKgPerUnit] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const agrupacioRendimentOptions = useMemo(
    () => [PLACEHOLDER, ...distinct(eligibleCategories.map((c) => c.agrupacioRendiment as string))],
    [eligibleCategories],
  );

  const categoriaOptions = useMemo(
    () => [
      PLACEHOLDER,
      ...eligibleCategories
        .filter((c) => agrupacioRendiment === PLACEHOLDER || c.agrupacioRendiment === agrupacioRendiment)
        .map((c) => c.nom),
    ],
    [eligibleCategories, agrupacioRendiment],
  );

  // Productes que ja compleixen Agrupació Rendiment + Categoria — base per
  // calcular les opcions d'Agrupació Producció i, després, de Producte.
  const productsUpToCategoria = useMemo(
    () =>
      products.filter((product) => {
        const cat = product.categoria ? categoriaByNom.get(product.categoria.nom) : undefined;
        if (!cat || cat.agrupacioRendiment === null) return false;
        if (agrupacioRendiment !== PLACEHOLDER && cat.agrupacioRendiment !== agrupacioRendiment) return false;
        if (categoria !== PLACEHOLDER && product.categoria?.nom !== categoria) return false;
        return true;
      }),
    [products, categoriaByNom, agrupacioRendiment, categoria],
  );

  const agrupacioProduccioOptions = useMemo(
    () => [
      PLACEHOLDER,
      ...distinct(
        productsUpToCategoria
          .map((product) => product.agrupacioProduccio)
          .filter((value): value is string => value !== null),
      ),
    ],
    [productsUpToCategoria],
  );

  const eligibleProducts = useMemo(
    () =>
      productsUpToCategoria.filter(
        (product) => agrupacioProduccio === PLACEHOLDER || product.agrupacioProduccio === agrupacioProduccio,
      ),
    [productsUpToCategoria, agrupacioProduccio],
  );

  const productOptions = useMemo(() => eligibleProducts.map(productLabel), [eligibleProducts]);

  const selectedProduct = eligibleProducts.find((product) => productLabel(product) === productLabelValue);

  // Advertència no bloquejant de duplicat: RendimentPorcApi (la resposta del
  // GET) NO porta producteId (es va treure a la capa 22 — ver la nota al
  // shared), per això no es pot mirar contra `data` ja carregat al hook.
  // Un sol GET amb coincidència exacta per descripció (mateix criteri que
  // el backend fa servir, confirmat amb curl real), disparat només quan
  // canvia el producte triat — no a cada tecla.
  const [isDuplicate, setIsDuplicate] = useState(false);

  useEffect(() => {
    if (!selectedProduct) {
      setIsDuplicate(false);
      return;
    }
    let cancelled = false;
    api
      .get<RespostaPaginada<RendimentPorcApi>>("/rendiments-porcs", {
        producte: selectedProduct.descripcio,
        mida: 1,
      })
      .then((resposta) => {
        if (!cancelled) setIsDuplicate(resposta.paginacio.total > 0);
      })
      .catch(() => {
        // Comprovació merament informativa — si falla, no es bloqueja ni es
        // mostra error, simplement no s'avisa del duplicat.
        if (!cancelled) setIsDuplicate(false);
      });
    return () => {
      cancelled = true;
    };
    // Depèn de l'id, no de l'objecte `selectedProduct` (nova referència a
    // cada render via .find()) — evita repetir el GET sense necessitat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct?.id]);

  async function handleSave() {
    if (!selectedProduct) {
      setFieldErrors({ producteId: "Selecciona un producte." });
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setIsSaving(true);
    try {
      await onSave({
        producteId: selectedProduct.id,
        unitatsPerPorc: parseDecimalInput(unitsPerPig, 2),
        kgPerUnitat: parseDecimalInput(kgPerUnit, 3),
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const nextFieldErrors: FieldErrors = {};
        for (const detall of caught.detalls ?? []) {
          if (detall.camp === "producteId" || detall.camp === "unitatsPerPorc" || detall.camp === "kgPerUnitat") {
            nextFieldErrors[detall.camp] = detall.missatge;
          }
        }
        if (Object.keys(nextFieldErrors).length > 0) {
          setFieldErrors(nextFieldErrors);
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError("No s'ha pogut desar la línia.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova línia">
      <div className="flex flex-col gap-4">
        <SelectFilter
          label="Agrupació Rendiment"
          options={agrupacioRendimentOptions}
          value={agrupacioRendiment}
          onChange={(value) => {
            setAgrupacioRendiment(value);
            setCategoria(PLACEHOLDER);
            setAgrupacioProduccio(PLACEHOLDER);
            setProductLabelValue(PLACEHOLDER);
          }}
        />
        <SelectFilter
          label="Categoria"
          options={categoriaOptions}
          value={categoria}
          onChange={(value) => {
            setCategoria(value);
            setAgrupacioProduccio(PLACEHOLDER);
            setProductLabelValue(PLACEHOLDER);
          }}
        />
        <SelectFilter
          label="Agrupació Producció"
          options={agrupacioProduccioOptions}
          value={agrupacioProduccio}
          onChange={(value) => {
            setAgrupacioProduccio(value);
            setProductLabelValue(PLACEHOLDER);
          }}
        />
        <div>
          <SelectFilter
            label="Producte"
            options={[PLACEHOLDER, ...productOptions]}
            value={productLabelValue}
            onChange={setProductLabelValue}
          />
          {fieldErrors.producteId && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.producteId}</p>}
          {isDuplicate && (
            <p className="mt-1.5 text-xs text-amber-700">
              Aquest producte ja té una línia de rendiment carregada. Pots continuar i desar-la igualment.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <TextField
              label="Unitats per porc"
              type="number"
              step="0.01"
              value={unitsPerPig}
              onChange={(event) => setUnitsPerPig(event.target.value)}
              error={fieldErrors.unitatsPerPorc}
            />
          </div>
          <div className="flex-1">
            <TextField
              label="Kg per unitat"
              type="number"
              step="0.001"
              value={kgPerUnit}
              onChange={(event) => setKgPerUnit(event.target.value)}
              error={fieldErrors.kgPerUnitat}
            />
          </div>
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Desant..." : "Desar"}
        </button>
      </div>
    </Modal>
  );
}
