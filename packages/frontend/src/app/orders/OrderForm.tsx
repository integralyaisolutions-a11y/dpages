"use client";

import { Plus, Trash2 } from "lucide-react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { TextField } from "@/components/ui/TextField";
import type { CarrierApi, ClientTariffApi, OrderApi, OrderLineApi, ProductApi, TariffApi } from "@/lib/api";
import { calculateOrderedWeightKg } from "@/lib/orderCalculations";

const NO_CLIENT = "Selecciona client...";
const NO_TARIFF = "Sense tarifa";
const NO_CARRIER = "Selecciona transportista...";
const NO_PRODUCT = "Selecciona producte...";
const STATUS_OPTIONS: OrderApi["status"][] = ["Oberta", "Incidència"];

function codeName(code: string, name: string) {
  return `${code} · ${name}`;
}

function parseCode(formatted: string) {
  return formatted.split(" · ")[0] ?? "";
}

type LineDraft = OrderLineApi;

function createEmptyLine(): LineDraft {
  return {
    id: crypto.randomUUID(),
    productCode: "",
    productionDate: "",
    orderedUnits: 0,
    deliveredUnits: 0,
    orderedWeightKg: 0,
    deliveredWeightKg: 0,
    productionNotes: "",
  };
}

export type OrderFormHandle = {
  submit: () => void;
};

export const OrderForm = forwardRef<
  OrderFormHandle,
  {
    mode: "create" | "edit";
    initialData?: OrderApi;
    clients: ClientTariffApi[];
    tariffs: TariffApi[];
    carriers: CarrierApi[];
    products: ProductApi[];
    onSave: (values: Omit<OrderApi, "number">) => void;
  }
>(function OrderForm({ mode, initialData, clients, tariffs, carriers, products, onSave }, ref) {
  const [status, setStatus] = useState<OrderApi["status"]>(initialData?.status ?? "Oberta");
  const [clientCode, setClientCode] = useState(initialData?.clientCode ?? "");
  const [poblacioDesti, setPoblacioDesti] = useState(initialData?.poblacioDesti ?? "");
  const [tariffCode, setTariffCode] = useState(initialData?.tariffCode ?? "");
  const [tariffTouched, setTariffTouched] = useState(false);
  const [carrierCode, setCarrierCode] = useState(initialData?.carrierCode ?? "");
  const [orderDate, setOrderDate] = useState(initialData?.orderDate ?? new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState(initialData?.deliveryDate ?? "");
  const [shippingDate, setShippingDate] = useState(initialData?.shippingDate ?? "");
  const [packageCount, setPackageCount] = useState(initialData?.packageCount ?? 1);
  const [deliveryAddress, setDeliveryAddress] = useState(initialData?.deliveryAddress ?? "");
  const [productionNotes, setProductionNotes] = useState(initialData?.productionNotes ?? "");
  const [deliveryNotes, setDeliveryNotes] = useState(initialData?.deliveryNotes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(initialData?.lines ?? []);
  const [error, setError] = useState<string | null>(null);

  function handleClientChange(formatted: string) {
    const code = parseCode(formatted);
    setClientCode(code);
    if (!tariffTouched) {
      const client = clients.find((item) => item.code === code);
      setTariffCode(client?.tariffCode ?? "");
    }
  }

  function handleTariffChange(formatted: string) {
    setTariffTouched(true);
    setTariffCode(formatted === NO_TARIFF ? "" : parseCode(formatted));
  }

  function updateLine(id: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

  const totalOrderedWeightKg = lines.reduce((sum, line) => {
    const product = products.find((p) => p.code === line.productCode);
    const result = calculateOrderedWeightKg(line.orderedUnits, product);
    return sum + (result.isCalculated ? result.value : line.orderedWeightKg);
  }, 0);

  useImperativeHandle(ref, () => ({
    submit: () => {
      if (!clientCode) {
        setError("Cal seleccionar un client.");
        return;
      }
      setError(null);
      const normalizedLines = lines.map((line) => {
        const product = products.find((p) => p.code === line.productCode);
        const result = calculateOrderedWeightKg(line.orderedUnits, product);
        return { ...line, orderedWeightKg: result.isCalculated ? result.value : line.orderedWeightKg };
      });
      onSave({
        status,
        clientCode,
        poblacioDesti,
        tariffCode: tariffCode || null,
        carrierCode: carrierCode || null,
        orderDate,
        deliveryDate: deliveryDate || null,
        shippingDate: shippingDate || null,
        packageCount,
        deliveryAddress,
        productionNotes,
        deliveryNotes,
        lines: normalizedLines,
      });
    },
  }));

  const clientOptions = [NO_CLIENT, ...clients.map((item) => codeName(item.code, item.name))];
  const clientValue = clientCode
    ? codeName(clientCode, clients.find((item) => item.code === clientCode)?.name ?? clientCode)
    : NO_CLIENT;

  const tariffOptions = [NO_TARIFF, ...tariffs.map((item) => codeName(item.code, item.name))];
  const tariffValue = tariffCode
    ? codeName(tariffCode, tariffs.find((item) => item.code === tariffCode)?.name ?? tariffCode)
    : NO_TARIFF;

  const carrierOptions = [NO_CARRIER, ...carriers.map((item) => codeName(item.code, item.name))];
  const carrierValue = carrierCode
    ? codeName(carrierCode, carriers.find((item) => item.code === carrierCode)?.name ?? carrierCode)
    : NO_CARRIER;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-gray-900">Capçalera</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField
            label="Núm. comanda"
            value={mode === "edit" ? (initialData?.number ?? "") : ""}
            placeholder={mode === "create" ? "(es generarà en desar)" : undefined}
            disabled
          />
          <SelectFilter
            label="Client"
            options={clientOptions}
            value={clientValue}
            onChange={handleClientChange}
          />
          <SelectFilter
            label="Estat"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(value) => setStatus(value as OrderApi["status"])}
          />

          <SelectFilter label="Tarifa" options={tariffOptions} value={tariffValue} onChange={handleTariffChange} />

          <SelectFilter
            label="Transportista"
            options={carrierOptions}
            value={carrierValue}
            onChange={(formatted) => setCarrierCode(formatted === NO_CARRIER ? "" : parseCode(formatted))}
          />
          <TextField
            label="Data comanda"
            type="date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
          />
          <TextField
            label="Data lliurament"
            type="date"
            value={deliveryDate}
            onChange={(event) => setDeliveryDate(event.target.value)}
          />

          <TextField
            label="Data expedició"
            type="date"
            value={shippingDate}
            onChange={(event) => setShippingDate(event.target.value)}
          />
          <TextField
            label="Núm. bultos"
            type="number"
            value={packageCount}
            onChange={(event) => setPackageCount(Number(event.target.value))}
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
            value={deliveryAddress}
            onChange={(event) => setDeliveryAddress(event.target.value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">Observacions de producció</span>
            <textarea
              value={productionNotes}
              onChange={(event) => setProductionNotes(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-900">Observacions de lliurament</span>
            <textarea
              value={deliveryNotes}
              onChange={(event) => setDeliveryNotes(event.target.value)}
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
            onClick={() => setLines((current) => [...current, createEmptyLine()])}
            className="flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Afegir línia
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="w-[14%] px-1.5 py-2 text-left font-medium text-gray-500">Producte</th>
                <th className="w-[9%] px-1.5 py-2 text-left font-medium text-gray-500">Categoria</th>
                <th className="w-[9%] px-1.5 py-2 text-left font-medium text-gray-500">Format</th>
                <th className="w-[8%] px-1.5 py-2 text-left font-medium text-gray-500">Envasat</th>
                <th className="w-[15%] px-1.5 py-2 text-left font-medium text-gray-500">Data producció</th>
                <th className="w-[9%] px-1.5 py-2 text-right font-medium text-gray-500">Unitats demanades</th>
                <th className="w-[9%] px-1.5 py-2 text-right font-medium text-gray-500">Unitats lliurades</th>
                <th className="w-[8%] px-1.5 py-2 text-right font-medium text-gray-500">Pes demanat (kg)</th>
                <th className="w-[7%] px-1.5 py-2 text-right font-medium text-gray-500">Pes lliurat (kg)</th>
                <th className="w-[7%] px-1.5 py-2 text-left font-medium text-gray-500">Obs. producció</th>
                <th className="w-[5%] px-1.5 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const product = products.find((p) => p.code === line.productCode);
                const orderedWeight = calculateOrderedWeightKg(line.orderedUnits, product);
                const productValue = line.productCode
                  ? codeName(line.productCode, product?.description ?? line.productCode)
                  : NO_PRODUCT;
                return (
                  <tr key={line.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-1.5 py-2">
                      <select
                        value={productValue}
                        onChange={(event) =>
                          updateLine(line.id, {
                            productCode: event.target.value === NO_PRODUCT ? "" : parseCode(event.target.value),
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      >
                        {[NO_PRODUCT, ...products.map((p) => codeName(p.code, p.description))].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-2 break-words text-gray-500">{product?.category ?? "—"}</td>
                    <td className="px-1.5 py-2 break-words text-gray-500">{product?.format ?? "—"}</td>
                    <td className="px-1.5 py-2 break-words text-gray-500">{product?.packaging ?? "—"}</td>
                    <td className="px-1.5 py-2">
                      <input
                        type="date"
                        value={line.productionDate ?? ""}
                        onChange={(event) => updateLine(line.id, { productionDate: event.target.value })}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        type="number"
                        value={line.orderedUnits}
                        onChange={(event) => updateLine(line.id, { orderedUnits: Number(event.target.value) })}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        type="number"
                        value={line.deliveredUnits}
                        onChange={(event) => updateLine(line.id, { deliveredUnits: Number(event.target.value) })}
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
                          value={line.orderedWeightKg}
                          onChange={(event) => updateLine(line.id, { orderedWeightKg: Number(event.target.value) })}
                          className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                        />
                      )}
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        type="number"
                        step="0.001"
                        value={line.deliveredWeightKg}
                        onChange={(event) => updateLine(line.id, { deliveredWeightKg: Number(event.target.value) })}
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <textarea
                        value={line.productionNotes}
                        onChange={(event) => updateLine(line.id, { productionNotes: event.target.value })}
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
