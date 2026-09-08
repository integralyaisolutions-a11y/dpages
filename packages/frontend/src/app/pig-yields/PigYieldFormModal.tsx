'use client';

import { useEffect, useMemo, useState } from 'react';
import { DecimalInput } from '@/components/ui/DecimalInput';
import { Modal } from '@/components/ui/Modal';
import { SelectFilter } from '@/components/ui/SelectFilter';
import { useCatalog } from '@/hooks/useCatalog';
import { useCategories } from '@/hooks/useCategories';
import {
  api,
  ApiError,
  type RendimentPorcApi,
  type RendimentPorcEntradaApi,
  type RespostaPaginada,
} from '@/lib/api';
import { parseDecimalInput } from '@/lib/decimals';

const PLACEHOLDER = 'Selecciona...';

type FieldErrors = {
  categoriaId?: string;
  agrupacioProduccio?: string;
  unitatsPerPorc?: string;
  kgPerUnitat?: string;
};

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

  // Cascada de 2 nivells (Agrupació Rendiment → Categoria → Agrupació
  // Producció): issues #3/#4, la fila ja no s'identifica per un producte
  // puntual, sinó per categoriaId + agrupacioProduccio (columna pròpia de
  // rendiments_porcs des de la migració 0018) — el nivell de Producte
  // desapareix per complet, ni de lectura ni d'escriptura (confirmat
  // contra rendiments-porcs.ts real: POST accepta categoriaId +
  // agrupacioProduccio, ja no producteId).
  const categoriaByNom = useMemo(() => new Map(categories.map((c) => [c.nom, c])), [categories]);
  // Sólo les categories amb agrupacioRendiment definit poden tenir línies de
  // rendiment (el backend rebutja la resta amb 400 VALIDACIO) — el cascade
  // només ofereix des del principi el subconjunt vàlid.
  const eligibleCategories = useMemo(
    () => categories.filter((c) => c.agrupacioRendiment !== null),
    [categories],
  );

  const [agrupacioRendiment, setAgrupacioRendiment] = useState(PLACEHOLDER);
  const [categoria, setCategoria] = useState(PLACEHOLDER);
  const [agrupacioProduccio, setAgrupacioProduccio] = useState(PLACEHOLDER);
  const [unitsPerPig, setUnitsPerPig] = useState('');
  const [kgPerUnit, setKgPerUnit] = useState('');
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
        .filter(
          (c) => agrupacioRendiment === PLACEHOLDER || c.agrupacioRendiment === agrupacioRendiment,
        )
        .map((c) => c.nom),
    ],
    [eligibleCategories, agrupacioRendiment],
  );

  const selectedCategoria = categoriaByNom.get(categoria);

  // Productes que ja compleixen Agrupació Rendiment + Categoria — base per
  // calcular les opcions d'Agrupació Producció (el catàleg complet ja el
  // carrega useCatalog(), no fa falta cap endpoint nou per filtrar-lo).
  const productsUpToCategoria = useMemo(
    () =>
      products.filter((product) => {
        const cat = product.categoria ? categoriaByNom.get(product.categoria.nom) : undefined;
        if (!cat || cat.agrupacioRendiment === null) return false;
        if (agrupacioRendiment !== PLACEHOLDER && cat.agrupacioRendiment !== agrupacioRendiment)
          return false;
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

  // Advertència no bloquejant de duplicat: substitueix la comprovació
  // vella per descripció de producte (?producte=) — ara la fila
  // s'identifica per categoriaId + agrupacioProduccio, així que aquest és
  // el filtre exacte que fa falta (mateix propòsit, mateix missatge,
  // disparat només quan canvien categoria o agrupació triades).
  const [isDuplicate, setIsDuplicate] = useState(false);

  useEffect(() => {
    if (!selectedCategoria || agrupacioProduccio === PLACEHOLDER) {
      // Sense els dos camps triats no hi ha res a comprovar contra l'API
      // (GET de sota) — cal netejar l'avís d'una selecció anterior, no és
      // un valor derivable durant el render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsDuplicate(false);
      return;
    }
    let cancelled = false;
    api
      .get<RespostaPaginada<RendimentPorcApi>>('/rendiments-porcs', {
        categoriaId: selectedCategoria.id,
        agrupacioProduccio,
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
  }, [selectedCategoria, agrupacioProduccio]);

  async function handleSave() {
    const nextFieldErrors: FieldErrors = {};
    if (!selectedCategoria) nextFieldErrors.categoriaId = 'Selecciona una categoria.';
    if (agrupacioProduccio === PLACEHOLDER) {
      nextFieldErrors.agrupacioProduccio = 'Selecciona una agrupació de producció.';
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSaving(true);
    try {
      await onSave({
        categoriaId: selectedCategoria!.id,
        agrupacioProduccio,
        unitatsPerPorc: parseDecimalInput(unitsPerPig, 2),
        kgPerUnitat: parseDecimalInput(kgPerUnit, 3),
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const nextErrors: FieldErrors = {};
        for (const detall of caught.detalls ?? []) {
          if (
            detall.camp === 'categoriaId' ||
            detall.camp === 'agrupacioProduccio' ||
            detall.camp === 'unitatsPerPorc' ||
            detall.camp === 'kgPerUnitat'
          ) {
            // El backend ja distingeix el cas típic de typo ("no coincideix
            // amb cap producte real d'aquesta categoria") amb el seu propi
            // missatge clar (rendiments-porcs.ts) — es mostra tal qual, no
            // es substitueix per un de genèric.
            nextErrors[detall.camp] = detall.missatge;
          }
        }
        if (Object.keys(nextErrors).length > 0) {
          setFieldErrors(nextErrors);
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
          }}
        />
        <div>
          <SelectFilter
            label="Categoria"
            options={categoriaOptions}
            value={categoria}
            onChange={(value) => {
              setCategoria(value);
              setAgrupacioProduccio(PLACEHOLDER);
            }}
          />
          {fieldErrors.categoriaId && (
            <p className="mt-1.5 text-xs text-red-600">{fieldErrors.categoriaId}</p>
          )}
        </div>
        <div>
          <SelectFilter
            label="Agrupació Producció"
            options={agrupacioProduccioOptions}
            value={agrupacioProduccio}
            onChange={setAgrupacioProduccio}
          />
          {fieldErrors.agrupacioProduccio && (
            <p className="mt-1.5 text-xs text-red-600">{fieldErrors.agrupacioProduccio}</p>
          )}
          {isDuplicate && (
            <p className="mt-1.5 text-xs text-amber-700">
              Aquesta categoria i agrupació ja tenen una línia de rendiment carregada. Pots
              continuar i desar-la igualment.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <DecimalInput
              label="Unitats per porc"
              value={unitsPerPig}
              onChange={setUnitsPerPig}
              error={fieldErrors.unitatsPerPorc}
            />
          </div>
          <div className="flex-1">
            <DecimalInput
              label="Kg per unitat"
              value={kgPerUnit}
              onChange={setKgPerUnit}
              error={fieldErrors.kgPerUnitat}
            />
          </div>
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Desant...' : 'Desar'}
        </button>
      </div>
    </Modal>
  );
}
