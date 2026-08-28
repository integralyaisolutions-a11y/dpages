"use client";

import { Plus, Trash2 } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataCard, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { OrderFormValues, OrderLineChanges } from "@/hooks/useOrders";
import type {
  ClientApi,
  ComandaDetallApi,
  ComandaLiniaApi,
  LiniaCreacioApi,
  LiniaEdicioApi,
  ProducteApi,
  TarifaResumApi,
  TransportistaApi,
} from "@/lib/api";
import { calculateOrderedWeightKg } from "@/lib/orderCalculations";

const NO_CLIENT = "Selecciona client...";
const NO_TARIFF = "Sense tarifa";
const NO_CARRIER = "Selecciona transportista...";
const NO_PRODUCT = "Selecciona producte...";

// amb_incidencia queda FORA d'aquesta llista a propòsit (capa 31, decisió
// de UX confirmada): el selector de capçalera només serveix per triar
// lliurement entre els 3 estats que no exigeixen motiu. L'única via cap a
// amb_incidencia és el botó "Marcar com a incidència" (pantalla pare), que
// sí demana `detall`. Si la comanda ja estava amb_incidencia en carregar
// el formulari, es reafegeix dinàmicament a les opcions (ver estatOptions
// més avall) només perquè el <select> mostri l'estat real — mai perquè es
// pugui triar cap a ella des d'acá.
const ESTAT_OPTIONS_SELECCIONABLES: string[] = ["oberta", "en_proces", "tancada"];
const ESTAT_LABELS: Record<string, string> = {
  oberta: "Oberta",
  en_proces: "En procés",
  tancada: "Tancada",
  amb_incidencia: "Amb incidència",
};

function clientLabel(client: ClientApi) {
  return `${client.codi ?? client.id} · ${client.nom ?? ""}`;
}

function tariffLabel(tariff: TarifaResumApi) {
  return `${tariff.codi ?? tariff.id} · ${tariff.nom}`;
}

function carrierLabel(carrier: TransportistaApi) {
  return `${carrier.codi ?? carrier.id} · ${carrier.nom}`;
}

function productLabel(product: ProducteApi) {
  return `${product.codi ?? product.id} · ${product.descripcio}`;
}

type LineDraft = ComandaLiniaApi;

let tempLineId = -1;

function createEmptyLine(ordinal: number): LineDraft {
  return {
    id: tempLineId--,
    ordinal,
    producte: null,
    categoria: null,
    format: null,
    envasat: null,
    unitatsDemanades: 0,
    kgDemanats: "0.000",
    kgEditable: true,
    unitatsLliurades: 0,
    kgLliurats: "0.000",
    confirmatA: null,
    // El backend calcula preuUnitari/totalLinia al crear la línia
    // (resolverPreuLinia: cascada tarifa→preu base→incidència, ver
    // investigación) — nunca se precalculan acá, quedan en "0.00" hasta
    // que la respuesta real del backend los complete.
    preuUnitari: "0.00",
    totalLinia: "0.00",
    dataProduccio: null,
    obsProduccio: "",
    esborrat: false,
  };
}

/**
 * Línia nova → shape de POST /comandes (alta completa) i POST
 * /comandes/:comandaId/linies (capa 30, afegir línia a una comanda ja
 * creada) — mateix `LiniaCreacioApi` als dos casos. `dataProduccio` és
 * capa 34: abans no existia aquest camp al body de creació, així que el
 * valor que l'usuari carregava a la línia es perdia en silenci en
 * comptes de guardar-se.
 */
function toLiniaCreacio(line: LineDraft): LiniaCreacioApi {
  return {
    producteId: line.producte!.id,
    unitatsDemanades: line.unitatsDemanades,
    kgDemanats: line.kgEditable ? line.kgDemanats : undefined,
    dataProduccio: line.dataProduccio,
  };
}

/** Línia existent → shape de PATCH .../linies/:liniaId (capa 30) — mai inclou producteId ni preuUnitari. */
function toLiniaEdicio(line: LineDraft): LiniaEdicioApi {
  return {
    unitatsDemanades: line.unitatsDemanades,
    kgDemanats: line.kgEditable ? line.kgDemanats : undefined,
    dataProduccio: line.dataProduccio,
    obsProduccio: line.obsProduccio || null,
  };
}

/**
 * Compara dues dates "YYYY-MM-DD" — buida a qualsevol banda mai viola res
 * (camps opcionals). ESTRICTE a propòsit (`>`, no `>=`): dates IGUALS
 * estan permeses — mateix criteri confirmat al backend (capa 34,
 * `validarCoherenciaDatesComanda` a comandes.ts), que documenta
 * explícitament aquest cas límit com a resolt (no com un buit).
 */
function isDateAfter(a: string, b: string): boolean {
  return a !== "" && b !== "" && a > b;
}

/** `ComandaLiniaApi.dataProduccio` viatja amb hora ("...T00:00:00Z"); les dates de capçalera no — normalitza abans de comparar. */
function dateOnly(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * Regles 1-3 — validació de client per feedback immediat; capa 34 les
 * aplica també al backend (POST /comandes, PATCH /comandes/:id i els dos
 * endpoints de línia) com a última paraula, per si aquest formulari deixa
 * passar algun cas (ver `extractComandaErrorMessage` a useOrders.ts). Es
 * revalida sencer contra les 3 dates de capçalera cada cop, mai comparant
 * només la que s'acaba de tocar contra un valor fix — així queda bé sense
 * importar l'ordre en què l'usuari les completa.
 */
function validateHeaderDates(
  dataProduccio: string,
  dataLliurament: string,
  dataExpedicio: string,
): { dataLliurament?: string; dataExpedicio?: string } {
  const errors: { dataLliurament?: string; dataExpedicio?: string } = {};
  if (isDateAfter(dataProduccio, dataLliurament)) {
    errors.dataLliurament = "Aquesta data no pot ser anterior a la Data de producció.";
  }
  if (isDateAfter(dataProduccio, dataExpedicio)) {
    errors.dataExpedicio = "Aquesta data no pot ser anterior a la Data de producció.";
  } else if (isDateAfter(dataExpedicio, dataLliurament)) {
    errors.dataExpedicio = "Aquesta data no pot ser posterior a la Data de lliurament.";
  }
  return errors;
}

/** Regles 4-6 — la data de producció d'una línia contra les 3 dates de capçalera ja vigents. */
function validateLineDate(
  lineDataProduccio: string | null,
  headerDataProduccio: string,
  headerDataLliurament: string,
  headerDataExpedicio: string,
): string | undefined {
  const lineDate = dateOnly(lineDataProduccio);
  if (lineDate === "") return undefined;
  if (isDateAfter(headerDataProduccio, lineDate)) {
    return "Aquesta data no pot ser anterior a la Data de producció de la comanda.";
  }
  if (isDateAfter(lineDate, headerDataLliurament)) {
    return "Aquesta data no pot ser posterior a la Data de lliurament.";
  }
  if (isDateAfter(lineDate, headerDataExpedicio)) {
    return "Aquesta data no pot ser posterior a la Data d'expedició.";
  }
  return undefined;
}

function applyProduct(line: LineDraft, product: ProducteApi | undefined): LineDraft {
  if (!product) {
    return { ...line, producte: null, categoria: null, format: null, envasat: null, kgEditable: true };
  }
  const orderedWeight = calculateOrderedWeightKg(line.unitatsDemanades, product);
  return {
    ...line,
    producte: { id: product.id, codi: product.codi, descripcio: product.descripcio },
    categoria: product.categoria?.nom ?? null,
    format: product.format,
    envasat: product.envasat,
    kgEditable: product.pesKg === null,
    kgDemanats: orderedWeight.isCalculated ? orderedWeight.value.toFixed(3) : line.kgDemanats,
  };
}

function LineFormCard({
  line,
  products,
  disabled,
  headerDates,
  onUpdate,
  onRemove,
}: {
  line: LineDraft;
  products: ProducteApi[];
  disabled: boolean;
  headerDates: { dataProduccio: string; dataLliurament: string; dataExpedicio: string };
  onUpdate: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  const product = products.find((p) => p.id === line.producte?.id);
  const dateError = validateLineDate(
    line.dataProduccio,
    headerDates.dataProduccio,
    headerDates.dataLliurament,
    headerDates.dataExpedicio,
  );
  // Línia ja existent (persistida, id>0): PATCH /comandes/:id/linies/:liniaId
  // (capa 30) no accepta producteId — no hi ha manera de comunicar un canvi
  // de producte al backend en una línia ja creada. Es desactiva el selector
  // perquè triar-ne un altre aquí no es guardaria mai en silenci.
  const productLocked = !disabled && line.id > 0;

  return (
    <DataCard>
      <div className="flex items-start gap-3">
        <select
          value={line.producte ? productLabel(line.producte as ProducteApi) : NO_PRODUCT}
          disabled={disabled || productLocked}
          onChange={(event) => {
            const selected = products.find((p) => productLabel(p) === event.target.value);
            onUpdate(applyProduct({ ...line }, selected));
          }}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        >
          {[NO_PRODUCT, ...products.map((p) => productLabel(p))].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Eliminar línia"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Categoria">{line.categoria ?? "—"}</DataCardField>
          <DataCardField label="Format">{line.format ?? "—"}</DataCardField>
          <DataCardField label="Envasat">{line.envasat ?? "—"}</DataCardField>
        </DataCardGrid>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Data producció</span>
          <input
            type="date"
            disabled={disabled}
            value={line.dataProduccio ? line.dataProduccio.slice(0, 10) : ""}
            onChange={(event) =>
              onUpdate({ dataProduccio: event.target.value ? `${event.target.value}T00:00:00Z` : null })
            }
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
          />
          {dateError && <span className="text-xs text-red-600">{dateError}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Unitats demanades</span>
          <input
            type="number"
            disabled={disabled}
            value={line.unitatsDemanades}
            onChange={(event) => {
              const unitatsDemanades = Number(event.target.value);
              const recalculated = calculateOrderedWeightKg(unitatsDemanades, product);
              onUpdate({
                unitatsDemanades,
                kgDemanats:
                  !line.kgEditable && recalculated.isCalculated ? recalculated.value.toFixed(3) : line.kgDemanats,
              });
            }}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
          />
        </label>
        {/* Unitats/pes lliurats: sólo lectura acá — únicamente el Panell
            Empaquetat los edita (PATCH .../linies/:liniaId/lliurament),
            nunca esta pantalla (regla de negocio confirmada). */}
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Unitats lliurades</span>
          <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-gray-500">
            {line.unitatsLliurades}
          </span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Pes demanat (kg)</span>
          {/* kgEditable es el campo autoritativo del backend (contrato §4.5:
              "no lo deduzcas en el frontend") — no se deriva de si ya se
              pudo calcular el peso localmente, que depende de que el
              catálogo haya terminado de cargar. */}
          {!line.kgEditable ? (
            <input
              type="text"
              value={Number(line.kgDemanats).toFixed(3).replace(".", ",")}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-sm text-gray-400"
            />
          ) : (
            <DecimalInput
              disabled={disabled}
              value={line.kgDemanats}
              onChange={(value) => onUpdate({ kgDemanats: Number(value).toFixed(3) })}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
            />
          )}
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Pes lliurat (kg)</span>
          <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-gray-500">
            {line.kgLliurats}
          </span>
        </div>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-xs text-gray-500">Obs. producció</span>
        <textarea
          value={line.obsProduccio ?? ""}
          disabled={disabled}
          onChange={(event) => onUpdate({ obsProduccio: event.target.value })}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        />
      </label>
    </DataCard>
  );
}

export type OrderFormHandle = {
  submit: () => void;
};

export const OrderForm = forwardRef<
  OrderFormHandle,
  {
    mode: "create" | "edit";
    initialData?: ComandaDetallApi;
    isFrozen?: boolean;
    clients: ClientApi[];
    tariffs: TarifaResumApi[];
    carriers: TransportistaApi[];
    products: ProducteApi[];
    onSave: (values: OrderFormValues, lineChanges: OrderLineChanges) => Promise<void>;
    onDeleteLine?: (liniaId: number) => Promise<void>;
    /**
     * Notifica al pare cada cop que canvia si hi ha dates en conflicte
     * (regles 1-6), perquè pugui deshabilitar el seu propi botó "Desar" —
     * segona capa independent del `return` anticipat dins `submit()`: no
     * depèn de cap timing de `useImperativeHandle`/ref, és un simple
     * booleà d'estat al pare que es recalcula amb cada render d'acá.
     */
    onDateErrorsChange?: (hasErrors: boolean) => void;
  }
>(function OrderForm(
  {
    mode,
    initialData,
    isFrozen = false,
    clients,
    tariffs,
    carriers,
    products,
    onSave,
    onDeleteLine,
    onDateErrorsChange,
  },
  ref,
) {
  const [estat, setEstat] = useState<string>(initialData?.estat ?? "oberta");
  const [clientId, setClientId] = useState<number | null>(initialData?.client?.id ?? null);
  const [poblacioDesti, setPoblacioDesti] = useState(initialData?.poblacioDesti ?? "");
  const [tarifaId, setTarifaId] = useState<number | null>(initialData?.tarifa?.id ?? null);
  const [tariffTouched, setTariffTouched] = useState(false);
  const [transportistaId, setTransportistaId] = useState<number | null>(initialData?.transportista?.id ?? null);
  const [dataProduccio, setDataProduccio] = useState(initialData?.dataProduccio?.slice(0, 10) ?? "");
  const [dataLliurament, setDataLliurament] = useState(initialData?.dataLliurament?.slice(0, 10) ?? "");
  const [dataExpedicio, setDataExpedicio] = useState(initialData?.dataExpedicio?.slice(0, 10) ?? "");
  const [bultos, setBultos] = useState(initialData?.bultos ?? 1);
  const [adrecaLliurament, setAdrecaLliurament] = useState(initialData?.adrecaLliurament ?? "");
  const [obsProduccio, setObsProduccio] = useState(initialData?.obsProduccio ?? "");
  const [obsLliurament, setObsLliurament] = useState(initialData?.obsLliurament ?? "");
  const [lines, setLines] = useState<LineDraft[]>(initialData?.linies ?? []);
  // Qué líneas tiene "tocadas" el usuario en esta sesión de edición — se
  // marca EXPLÍCITAMENTE en el momento de la acción (updateLine/afegir
  // línia), nunca se infiere comparando valores más tarde. Evita cualquier
  // falso positivo por comparación de tipo/formato: si el id no está acá,
  // el usuario no tocó esa línea, punto.
  const [dirtyLineIds, setDirtyLineIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [lineToDelete, setLineToDelete] = useState<LineDraft | null>(null);
  const [lineDeleteError, setLineDeleteError] = useState<string | null>(null);
  const [isDeletingLine, setIsDeletingLine] = useState(false);

  function handleClientChange(id: number | null) {
    setClientId(id);
    if (!tariffTouched) {
      const client = clients.find((item) => item.id === id);
      setTarifaId(client?.tarifa?.id ?? null);
    }
  }

  function updateLine(id: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    setDirtyLineIds((current) => (current.has(id) ? current : new Set(current).add(id)));
  }

  function addLine() {
    const newLine = createEmptyLine(lines.length + 1);
    setLines((current) => [...current, newLine]);
    setDirtyLineIds((current) => new Set(current).add(newLine.id));
  }

  function removeLine(line: LineDraft) {
    // Línia nova (nunca persistida): sólo se saca del borrador local, no
    // hay nada que borrar en el backend.
    if (mode === "create" || line.id < 0) {
      setLines((current) => current.filter((item) => item.id !== line.id));
      setDirtyLineIds((current) => {
        if (!current.has(line.id)) return current;
        const next = new Set(current);
        next.delete(line.id);
        return next;
      });
      return;
    }
    // Línia existente en modo edición: DELETE real, con confirmación.
    setLineDeleteError(null);
    setLineToDelete(line);
  }

  async function handleConfirmDeleteLine() {
    if (!lineToDelete || !onDeleteLine) return;
    setIsDeletingLine(true);
    setLineDeleteError(null);
    try {
      await onDeleteLine(lineToDelete.id);
      setLines((current) => current.filter((item) => item.id !== lineToDelete.id));
      setLineToDelete(null);
    } catch (caught) {
      setLineDeleteError(caught instanceof Error ? caught.message : "No s'ha pogut eliminar la línia.");
    } finally {
      setIsDeletingLine(false);
    }
  }

  const totalOrderedWeightKg = lines.reduce((sum, line) => sum + Number(line.kgDemanats), 0);

  // Regles 1-6, recalculades sencer cada render contra les 3 dates de
  // capçalera vigents (no comparant només la que s'acaba de tocar) — es
  // reflecteix en temps real als TextField/línies de sota via el prop
  // `error`, i és la MATEIXA constant que consulta submit() més avall
  // (no es recalcula per separat — elimina qualsevol possibilitat de
  // desincronització entre el que es pinta i el que es valida).
  const headerDateErrors = validateHeaderDates(dataProduccio, dataLliurament, dataExpedicio);
  const hasLineDateErrors = lines.some(
    (line) => validateLineDate(line.dataProduccio, dataProduccio, dataLliurament, dataExpedicio) !== undefined,
  );
  const hasDateErrors = Object.keys(headerDateErrors).length > 0 || hasLineDateErrors;

  // Segona capa, independent del return anticipat dins submit(): avisa al
  // pare perquè pugui deshabilitar el seu propi botó "Desar" mentre hi
  // hagi dates en conflicte — així un click ni arriba a disparar submit().
  useEffect(() => {
    onDateErrorsChange?.(hasDateErrors);
  }, [hasDateErrors, onDateErrorsChange]);

  useImperativeHandle(ref, () => ({
    submit: () => {
      if (!clientId) {
        setError("Cal seleccionar un client.");
        return;
      }

      if (hasDateErrors) {
        setError("Hi ha dates inconsistents al formulari — revisa els missatges marcats en vermell abans de desar.");
        return;
      }

      setError(null);

      const validLines = lines.filter((line) => line.producte !== null && line.unitatsDemanades > 0);

      // Capa 30 — en edición, las línias nuevas/editadas se guardan por su
      // propio endpoint (POST/PATCH .../linies), nunca embebidas en el
      // PATCH de cabecera. En creación siguen viajando dentro de
      // ComandaCreacioApi.linies (embed original), lineChanges queda vacío.
      const lineChanges: OrderLineChanges =
        mode === "edit"
          ? {
              novaLinies: validLines.filter((line) => dirtyLineIds.has(line.id) && line.id < 0).map(toLiniaCreacio),
              liniesEditades: validLines
                .filter((line) => dirtyLineIds.has(line.id) && line.id > 0)
                .map((line) => ({ liniaId: line.id, patch: toLiniaEdicio(line) })),
            }
          : { novaLinies: [], liniesEditades: [] };

      void onSave(
        {
          clientId,
          tarifaId,
          transportistaId,
          dataProduccio: dataProduccio ? `${dataProduccio}T00:00:00Z` : null,
          dataExpedicio: dataExpedicio ? `${dataExpedicio}T00:00:00Z` : null,
          dataLliurament: dataLliurament ? `${dataLliurament}T00:00:00Z` : null,
          bultos,
          obsProduccio: obsProduccio || null,
          obsLliurament: obsLliurament || null,
          poblacioDesti: poblacioDesti || null,
          adrecaLliurament: adrecaLliurament || null,
          estat,
          linies: mode === "create" ? validLines.map(toLiniaCreacio) : [],
        },
        lineChanges,
      );
    },
  }));

  const clientOptions = [NO_CLIENT, ...clients.map((item) => clientLabel(item))];
  const clientValue = clientId
    ? (clients.find((item) => item.id === clientId) && clientLabel(clients.find((item) => item.id === clientId)!)) ??
      NO_CLIENT
    : NO_CLIENT;

  const tariffOptions = [NO_TARIFF, ...tariffs.map((item) => tariffLabel(item))];
  const tariffValue = tarifaId
    ? (tariffs.find((item) => item.id === tarifaId) && tariffLabel(tariffs.find((item) => item.id === tarifaId)!)) ??
      NO_TARIFF
    : NO_TARIFF;

  const carrierOptions = [NO_CARRIER, ...carriers.map((item) => carrierLabel(item))];
  const carrierValue = transportistaId
    ? (carriers.find((item) => item.id === transportistaId) &&
        carrierLabel(carriers.find((item) => item.id === transportistaId)!)) ??
      NO_CARRIER
    : NO_CARRIER;

  // Manté visible l'estat real quan ja és amb_incidencia (no forma part de
  // ESTAT_OPTIONS_SELECCIONABLES, ver comentari a dalt) — mai s'hi pot
  // TRIAR cap a ella des d'aquest selector, només es mostra si ja hi és.
  const estatOptions = ESTAT_OPTIONS_SELECCIONABLES.includes(estat)
    ? ESTAT_OPTIONS_SELECCIONABLES
    : [estat, ...ESTAT_OPTIONS_SELECCIONABLES];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-gray-900">Capçalera</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField
            label="Núm. comanda"
            value={mode === "edit" ? (initialData?.num ?? "") : ""}
            placeholder={mode === "create" ? "(es generarà en desar)" : undefined}
            disabled
          />
          <SelectFilter
            label="Client"
            options={clientOptions}
            value={clientValue}
            onChange={(label) => {
              if (isFrozen) return;
              const client = clients.find((item) => clientLabel(item) === label);
              handleClientChange(client?.id ?? null);
            }}
          />
          <SelectFilter
            label="Estat"
            options={estatOptions.map((value) => ESTAT_LABELS[value]!)}
            value={ESTAT_LABELS[estat] ?? estat}
            onChange={(label) => {
              if (isFrozen) return;
              const value = estatOptions.find((option) => ESTAT_LABELS[option] === label);
              if (value) setEstat(value);
            }}
          />

          <SelectFilter
            label="Tarifa"
            options={tariffOptions}
            value={tariffValue}
            onChange={(label) => {
              if (isFrozen) return;
              setTariffTouched(true);
              const tariff = tariffs.find((item) => tariffLabel(item) === label);
              setTarifaId(tariff?.id ?? null);
            }}
          />

          <SelectFilter
            label="Transportista"
            options={carrierOptions}
            value={carrierValue}
            onChange={(label) => {
              if (isFrozen) return;
              const carrier = carriers.find((item) => carrierLabel(item) === label);
              setTransportistaId(carrier?.id ?? null);
            }}
          />
          <TextField
            label="Data producció"
            type="date"
            disabled={isFrozen}
            value={dataProduccio}
            onChange={(event) => setDataProduccio(event.target.value)}
          />
          <TextField
            label="Data lliurament"
            type="date"
            disabled={isFrozen}
            value={dataLliurament}
            onChange={(event) => setDataLliurament(event.target.value)}
            error={headerDateErrors.dataLliurament}
          />

          <TextField
            label="Data expedició"
            type="date"
            disabled={isFrozen}
            value={dataExpedicio}
            onChange={(event) => setDataExpedicio(event.target.value)}
            error={headerDateErrors.dataExpedicio}
          />
          <TextField
            label="Núm. bultos"
            type="number"
            disabled={isFrozen}
            value={bultos ?? 0}
            onChange={(event) => setBultos(Number(event.target.value))}
          />
          <TextField
            label="Població de destí"
            disabled={isFrozen}
            value={poblacioDesti}
            onChange={(event) => setPoblacioDesti(event.target.value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <TextField
            label="Adreça de lliurament"
            disabled={isFrozen}
            value={adrecaLliurament}
            onChange={(event) => setAdrecaLliurament(event.target.value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">Observacions de producció</span>
            <textarea
              value={obsProduccio}
              disabled={isFrozen}
              onChange={(event) => setObsProduccio(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">Observacions de lliurament</span>
            <textarea
              value={obsLliurament}
              disabled={isFrozen}
              onChange={(event) => setObsLliurament(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
            />
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Línies</h2>
          <button
            type="button"
            disabled={isFrozen}
            onClick={addLine}
            className="flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            <Plus className="h-4 w-4" />
            Afegir línia
          </button>
        </div>

        <div className="flex flex-col gap-3 xl:hidden">
          {lines.map((line) => (
            <LineFormCard
              key={line.id}
              line={line}
              products={products}
              disabled={isFrozen}
              headerDates={{ dataProduccio, dataLliurament, dataExpedicio }}
              onUpdate={(patch) => updateLine(line.id, patch)}
              onRemove={() => removeLine(line)}
            />
          ))}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-semibold text-gray-900">
            Total pes demanat (kg): {totalOrderedWeightKg.toFixed(3).replace(".", ",")}
          </div>
        </div>

        <div className="hidden overflow-x-auto rounded-lg border border-gray-200 xl:block">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="w-[14%] px-1.5 py-2 text-left font-medium text-gray-500 break-words">Producte</th>
                <th className="w-[9%] px-1.5 py-2 text-left font-medium text-gray-500 break-words">Categoria</th>
                <th className="w-[9%] px-1.5 py-2 text-left font-medium text-gray-500 break-words">Format</th>
                <th className="w-[8%] px-1.5 py-2 text-left font-medium text-gray-500 break-words">Envasat</th>
                <th className="w-[15%] px-1.5 py-2 text-left font-medium text-gray-500 break-words">Data producció</th>
                <th className="w-[9%] px-1.5 py-2 text-right font-medium text-gray-500 break-words">Unitats demanades</th>
                <th className="w-[9%] px-1.5 py-2 text-right font-medium text-gray-500 break-words">Unitats lliurades</th>
                <th className="w-[8%] px-1.5 py-2 text-right font-medium text-gray-500 break-words">Pes demanat (kg)</th>
                <th className="w-[7%] px-1.5 py-2 text-right font-medium text-gray-500 break-words">Pes lliurat (kg)</th>
                <th className="w-[7%] px-1.5 py-2 text-left font-medium text-gray-500 break-words">Obs. producció</th>
                <th className="w-[5%] px-1.5 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const product = products.find((p) => p.id === line.producte?.id);
                const productValue = line.producte ? productLabel(line.producte as ProducteApi) : NO_PRODUCT;
                const lineDateError = validateLineDate(line.dataProduccio, dataProduccio, dataLliurament, dataExpedicio);
                return (
                  <tr key={line.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-1.5 py-2">
                      <select
                        value={productValue}
                        disabled={isFrozen || line.id > 0}
                        onChange={(event) => {
                          const selected = products.find((p) => productLabel(p) === event.target.value);
                          updateLine(line.id, applyProduct({ ...line }, selected));
                        }}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        {[NO_PRODUCT, ...products.map((p) => productLabel(p))].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-2 break-words text-gray-500">{line.categoria ?? "—"}</td>
                    <td className="px-1.5 py-2 break-words text-gray-500">{line.format ?? "—"}</td>
                    <td className="px-1.5 py-2 break-words text-gray-500">{line.envasat ?? "—"}</td>
                    <td className="px-1.5 py-2">
                      <input
                        type="date"
                        disabled={isFrozen}
                        value={line.dataProduccio ? line.dataProduccio.slice(0, 10) : ""}
                        onChange={(event) =>
                          updateLine(line.id, {
                            dataProduccio: event.target.value ? `${event.target.value}T00:00:00Z` : null,
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                      />
                      {lineDateError && <p className="mt-1 text-xs text-red-600">{lineDateError}</p>}
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        type="number"
                        disabled={isFrozen}
                        value={line.unitatsDemanades}
                        onChange={(event) => {
                          const unitatsDemanades = Number(event.target.value);
                          const recalculated = calculateOrderedWeightKg(unitatsDemanades, product);
                          updateLine(line.id, {
                            unitatsDemanades,
                            kgDemanats:
                              !line.kgEditable && recalculated.isCalculated
                                ? recalculated.value.toFixed(3)
                                : line.kgDemanats,
                          });
                        }}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </td>
                    {/* Sólo lectura: ver nota de Unitats/Pes lliurades en LineFormCard. */}
                    <td className="px-1.5 py-2 text-right text-gray-500">{line.unitatsLliurades}</td>
                    <td className="px-1.5 py-2">
                      {!line.kgEditable ? (
                        <input
                          type="text"
                          value={Number(line.kgDemanats).toFixed(3).replace(".", ",")}
                          disabled
                          className="w-full rounded-md border border-gray-200 bg-gray-50 px-1.5 py-1 text-right text-sm text-gray-400"
                        />
                      ) : (
                        <DecimalInput
                          disabled={isFrozen}
                          value={line.kgDemanats}
                          onChange={(value) => updateLine(line.id, { kgDemanats: Number(value).toFixed(3) })}
                          className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      )}
                    </td>
                    <td className="px-1.5 py-2 text-right text-gray-500">{line.kgLliurats}</td>
                    <td className="px-1.5 py-2">
                      <textarea
                        value={line.obsProduccio ?? ""}
                        disabled={isFrozen}
                        onChange={(event) => updateLine(line.id, { obsProduccio: event.target.value })}
                        rows={1}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(line)}
                        disabled={isFrozen}
                        aria-label="Eliminar línia"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={11} className="px-2 py-3 text-right text-sm font-semibold text-gray-900">
                  Total pes demanat (kg): {totalOrderedWeightKg.toFixed(3).replace(".", ",")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>

      <ConfirmDialog
        isOpen={lineToDelete !== null}
        title="Eliminar línia"
        message={lineToDelete ? `Vols eliminar la línia de "${lineToDelete.producte?.descripcio ?? "—"}"?` : ""}
        confirmLabel="Eliminar"
        cancelLabel="Cancel·lar"
        errorMessage={lineDeleteError}
        isConfirming={isDeletingLine}
        onConfirm={handleConfirmDeleteLine}
        onCancel={() => {
          setLineToDelete(null);
          setLineDeleteError(null);
        }}
      />
    </div>
  );
});
