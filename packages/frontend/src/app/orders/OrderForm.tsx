"use client";

import { Plus, Trash2 } from "lucide-react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { DataCard, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { ClientApi, ComandaDetallApi, ComandaLiniaApi, ProducteApi, TarifaResumApi, TransportistaApi } from "@/lib/api";
import { calculateOrderedWeightKg } from "@/lib/orderCalculations";

const NO_CLIENT = "Selecciona client...";
const NO_TARIFF = "Sense tarifa";
const NO_CARRIER = "Selecciona transportista...";
const NO_PRODUCT = "Selecciona producte...";

const ESTAT_OPTIONS: ComandaDetallApi["estat"][] = ["oberta", "en_proces", "tancada", "amb_incidencia"];
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
    preuUnitari: "0.00",
    totalLinia: "0.00",
    dataProduccio: null,
    obsProduccio: "",
    esborrat: false,
  };
}

function applyProduct(line: LineDraft, product: ProducteApi | undefined): LineDraft {
  if (!product) {
    return { ...line, producte: null, categoria: null, format: null, envasat: null, kgEditable: true };
  }
  const orderedWeight = calculateOrderedWeightKg(line.unitatsDemanades, product);
  const preuUnitari = product.preuVenda ?? "0.00";
  return {
    ...line,
    producte: { id: product.id, codi: product.codi, descripcio: product.descripcio },
    categoria: product.categoria?.nom ?? null,
    format: product.format,
    envasat: product.envasat,
    kgEditable: product.pesKg === null,
    kgDemanats: orderedWeight.isCalculated ? orderedWeight.value.toFixed(3) : line.kgDemanats,
    preuUnitari,
    totalLinia: (line.unitatsDemanades * Number(preuUnitari)).toFixed(2),
  };
}

function LineFormCard({
  line,
  products,
  onUpdate,
  onRemove,
}: {
  line: LineDraft;
  products: ProducteApi[];
  onUpdate: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  const product = products.find((p) => p.id === line.producte?.id);
  const orderedWeight = calculateOrderedWeightKg(line.unitatsDemanades, product);

  return (
    <DataCard>
      <div className="flex items-start gap-3">
        <select
          value={line.producte ? productLabel(line.producte as ProducteApi) : NO_PRODUCT}
          onChange={(event) => {
            const selected = products.find((p) => productLabel(p) === event.target.value);
            onUpdate(applyProduct({ ...line }, selected));
          }}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
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
          aria-label="Eliminar línia"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-red-500 hover:text-red-600"
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
            value={line.dataProduccio ? line.dataProduccio.slice(0, 10) : ""}
            onChange={(event) =>
              onUpdate({ dataProduccio: event.target.value ? `${event.target.value}T00:00:00Z` : null })
            }
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Unitats demanades</span>
          <input
            type="number"
            value={line.unitatsDemanades}
            onChange={(event) => {
              const unitatsDemanades = Number(event.target.value);
              const recalculated = calculateOrderedWeightKg(unitatsDemanades, product);
              onUpdate({
                unitatsDemanades,
                kgDemanats: recalculated.isCalculated ? recalculated.value.toFixed(3) : line.kgDemanats,
                totalLinia: (unitatsDemanades * Number(line.preuUnitari)).toFixed(2),
              });
            }}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Unitats lliurades</span>
          <input
            type="number"
            value={line.unitatsLliurades}
            onChange={(event) => onUpdate({ unitatsLliurades: Number(event.target.value) })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Pes demanat (kg)</span>
          {orderedWeight.isCalculated ? (
            <input
              type="text"
              value={orderedWeight.value.toFixed(3).replace(".", ",")}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-sm text-gray-400"
            />
          ) : (
            <input
              type="number"
              step="0.001"
              value={line.kgDemanats}
              onChange={(event) => onUpdate({ kgDemanats: Number(event.target.value).toFixed(3) })}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            />
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Pes lliurat (kg)</span>
          <input
            type="number"
            step="0.001"
            value={line.kgLliurats}
            onChange={(event) => onUpdate({ kgLliurats: Number(event.target.value).toFixed(3) })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </label>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-xs text-gray-500">Obs. producció</span>
        <textarea
          value={line.obsProduccio ?? ""}
          onChange={(event) => onUpdate({ obsProduccio: event.target.value })}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
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
    clients: ClientApi[];
    tariffs: TarifaResumApi[];
    carriers: TransportistaApi[];
    products: ProducteApi[];
    onSave: (values: Omit<ComandaDetallApi, "id" | "num">) => void;
  }
>(function OrderForm({ mode, initialData, clients, tariffs, carriers, products, onSave }, ref) {
  const [estat, setEstat] = useState<ComandaDetallApi["estat"]>(initialData?.estat ?? "oberta");
  const [clientId, setClientId] = useState<number | null>(initialData?.client?.id ?? null);
  const [poblacioDesti, setPoblacioDesti] = useState(initialData?.poblacioDesti ?? "");
  const [tarifaId, setTarifaId] = useState<number | null>(initialData?.tarifa?.id ?? null);
  const [tariffTouched, setTariffTouched] = useState(false);
  const [transportistaId, setTransportistaId] = useState<number | null>(initialData?.transportista?.id ?? null);
  const [dataComanda, setDataComanda] = useState(
    initialData?.dataComanda.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [dataLliurament, setDataLliurament] = useState(initialData?.dataLliurament?.slice(0, 10) ?? "");
  const [dataExpedicio, setDataExpedicio] = useState(initialData?.dataExpedicio?.slice(0, 10) ?? "");
  const [bultos, setBultos] = useState(initialData?.bultos ?? 1);
  const [adrecaLliurament, setAdrecaLliurament] = useState(initialData?.adrecaLliurament ?? "");
  const [obsProduccio, setObsProduccio] = useState(initialData?.obsProduccio ?? "");
  const [obsLliurament, setObsLliurament] = useState(initialData?.obsLliurament ?? "");
  const [lines, setLines] = useState<LineDraft[]>(initialData?.linies ?? []);
  const [error, setError] = useState<string | null>(null);

  function handleClientChange(id: number | null) {
    setClientId(id);
    if (!tariffTouched) {
      const client = clients.find((item) => item.id === id);
      setTarifaId(client?.tarifa?.id ?? null);
    }
  }

  function updateLine(id: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: number) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

  const totalOrderedWeightKg = lines.reduce((sum, line) => sum + Number(line.kgDemanats), 0);

  useImperativeHandle(ref, () => ({
    submit: () => {
      if (!clientId) {
        setError("Cal seleccionar un client.");
        return;
      }
      setError(null);
      const client = clients.find((item) => item.id === clientId) ?? null;
      const tarifa = tariffs.find((item) => item.id === tarifaId) ?? null;
      const transportista = carriers.find((item) => item.id === transportistaId) ?? null;
      const totalKg = lines.reduce((sum, line) => sum + Number(line.kgDemanats), 0).toFixed(3);
      const totalEur = lines.reduce((sum, line) => sum + Number(line.totalLinia), 0).toFixed(2);
      onSave({
        origen: initialData?.origen ?? "manual",
        estat,
        client: client ? { id: client.id, nom: client.nom ?? "", poblacio: client.poblacio } : null,
        tarifa: tarifa ? { id: tarifa.id, nom: tarifa.nom } : null,
        transportista: transportista ? { id: transportista.id, nom: transportista.nom } : null,
        poblacioDesti: poblacioDesti || null,
        adrecaLliurament: adrecaLliurament || null,
        dataComanda: `${dataComanda}T00:00:00Z`,
        dataProduccio: initialData?.dataProduccio ?? null,
        dataExpedicio: dataExpedicio ? `${dataExpedicio}T00:00:00Z` : null,
        dataLliurament: dataLliurament ? `${dataLliurament}T00:00:00Z` : null,
        bultos,
        obsProduccio: obsProduccio || null,
        obsLliurament: obsLliurament || null,
        totalKg,
        totalEur,
        congelada: initialData?.congelada ?? false,
        congelatA: initialData?.congelatA ?? null,
        linies: lines,
        incidencies: initialData?.incidencies ?? [],
      });
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
              const client = clients.find((item) => clientLabel(item) === label);
              handleClientChange(client?.id ?? null);
            }}
          />
          <SelectFilter
            label="Estat"
            options={ESTAT_OPTIONS.map((value) => ESTAT_LABELS[value])}
            value={ESTAT_LABELS[estat]}
            onChange={(label) => {
              const value = ESTAT_OPTIONS.find((option) => ESTAT_LABELS[option] === label);
              if (value) setEstat(value);
            }}
          />

          <SelectFilter
            label="Tarifa"
            options={tariffOptions}
            value={tariffValue}
            onChange={(label) => {
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
              const carrier = carriers.find((item) => carrierLabel(item) === label);
              setTransportistaId(carrier?.id ?? null);
            }}
          />
          <TextField
            label="Data comanda"
            type="date"
            value={dataComanda}
            onChange={(event) => setDataComanda(event.target.value)}
          />
          <TextField
            label="Data lliurament"
            type="date"
            value={dataLliurament}
            onChange={(event) => setDataLliurament(event.target.value)}
          />

          <TextField
            label="Data expedició"
            type="date"
            value={dataExpedicio}
            onChange={(event) => setDataExpedicio(event.target.value)}
          />
          <TextField
            label="Núm. bultos"
            type="number"
            value={bultos ?? 0}
            onChange={(event) => setBultos(Number(event.target.value))}
          />
          <TextField
            label="Població de destí"
            value={poblacioDesti}
            onChange={(event) => setPoblacioDesti(event.target.value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <TextField
            label="Adreça de lliurament"
            value={adrecaLliurament}
            onChange={(event) => setAdrecaLliurament(event.target.value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">Observacions de producció</span>
            <textarea
              value={obsProduccio}
              onChange={(event) => setObsProduccio(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">Observacions de lliurament</span>
            <textarea
              value={obsLliurament}
              onChange={(event) => setObsLliurament(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
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
            onClick={() => setLines((current) => [...current, createEmptyLine(current.length + 1)])}
            className="flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
              onUpdate={(patch) => updateLine(line.id, patch)}
              onRemove={() => removeLine(line.id)}
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
                const orderedWeight = calculateOrderedWeightKg(line.unitatsDemanades, product);
                const productValue = line.producte ? productLabel(line.producte as ProducteApi) : NO_PRODUCT;
                return (
                  <tr key={line.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-1.5 py-2">
                      <select
                        value={productValue}
                        onChange={(event) => {
                          const selected = products.find((p) => productLabel(p) === event.target.value);
                          updateLine(line.id, applyProduct({ ...line }, selected));
                        }}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
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
                        value={line.dataProduccio ? line.dataProduccio.slice(0, 10) : ""}
                        onChange={(event) =>
                          updateLine(line.id, {
                            dataProduccio: event.target.value ? `${event.target.value}T00:00:00Z` : null,
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        type="number"
                        value={line.unitatsDemanades}
                        onChange={(event) => {
                          const unitatsDemanades = Number(event.target.value);
                          const recalculated = calculateOrderedWeightKg(unitatsDemanades, product);
                          updateLine(line.id, {
                            unitatsDemanades,
                            kgDemanats: recalculated.isCalculated ? recalculated.value.toFixed(3) : line.kgDemanats,
                            totalLinia: (unitatsDemanades * Number(line.preuUnitari)).toFixed(2),
                          });
                        }}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        type="number"
                        value={line.unitatsLliurades}
                        onChange={(event) => updateLine(line.id, { unitatsLliurades: Number(event.target.value) })}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      {orderedWeight.isCalculated ? (
                        <input
                          type="text"
                          value={orderedWeight.value.toFixed(3).replace(".", ",")}
                          disabled
                          className="w-full rounded-md border border-gray-200 bg-gray-50 px-1.5 py-1 text-right text-sm text-gray-400"
                        />
                      ) : (
                        <input
                          type="number"
                          step="0.001"
                          value={line.kgDemanats}
                          onChange={(event) => updateLine(line.id, { kgDemanats: Number(event.target.value).toFixed(3) })}
                          className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                        />
                      )}
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        type="number"
                        step="0.001"
                        value={line.kgLliurats}
                        onChange={(event) => updateLine(line.id, { kgLliurats: Number(event.target.value).toFixed(3) })}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <textarea
                        value={line.obsProduccio ?? ""}
                        onChange={(event) => updateLine(line.id, { obsProduccio: event.target.value })}
                        rows={1}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        aria-label="Eliminar línia"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:text-red-600"
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
    </div>
  );
});
