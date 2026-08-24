"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { DateRangeInput } from "@/components/ui/DateRangeInput";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import { useCarriers } from "@/hooks/useCarriers";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useOrders } from "@/hooks/useOrders";
import { useRates } from "@/hooks/useRates";
import { sumOrderedWeightKg } from "@/lib/orderCalculations";

const ALL = "Tots";
const ALL_FEM = "Totes";

function formatKg(value: number) {
  return `${value.toFixed(3).replace(".", ",")}`;
}

function formatDateShort(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

export default function OfficePage() {
  const router = useRouter();
  const { data, isLoading, error } = useOrders();
  const { data: clients } = useClientTariffs();
  const { tariffColumns } = useRates();
  const { data: carriers } = useCarriers();

  const [clientSearch, setClientSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [carrierFilter, setCarrierFilter] = useState(ALL);
  const [tariffFilter, setTariffFilter] = useState(ALL_FEM);
  const [destinationFilter, setDestinationFilter] = useState(ALL_FEM);
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [shippingDateFrom, setShippingDateFrom] = useState("");
  const [shippingDateTo, setShippingDateTo] = useState("");
  const [deliveryDateFrom, setDeliveryDateFrom] = useState("");
  const [deliveryDateTo, setDeliveryDateTo] = useState("");

  const destinationOptions = useMemo(
    () => [ALL_FEM, ...Array.from(new Set(data.map((order) => order.poblacioDesti)))],
    [data],
  );

  const filtered = data.filter((order) => {
    if (clientSearch) {
      const client = clients.find((item) => item.code === order.clientCode);
      const term = clientSearch.toLowerCase();
      const matches = client?.name.toLowerCase().includes(term) || client?.code.toLowerCase().includes(term);
      if (!matches) return false;
    }
    if (statusFilter !== ALL && order.status !== statusFilter) return false;
    if (carrierFilter !== ALL) {
      const carrier = carriers.find((item) => item.code === order.carrierCode);
      if (carrier?.name !== carrierFilter) return false;
    }
    if (tariffFilter !== ALL_FEM) {
      const tariff = tariffColumns.find((item) => item.code === order.tariffCode);
      if (tariff?.name !== tariffFilter) return false;
    }
    if (destinationFilter !== ALL_FEM && order.poblacioDesti !== destinationFilter) return false;
    if (orderDateFrom && order.orderDate < orderDateFrom) return false;
    if (orderDateTo && order.orderDate > orderDateTo) return false;
    if (shippingDateFrom && (!order.shippingDate || order.shippingDate < shippingDateFrom)) return false;
    if (shippingDateTo && (!order.shippingDate || order.shippingDate > shippingDateTo)) return false;
    if (deliveryDateFrom && (!order.deliveryDate || order.deliveryDate < deliveryDateFrom)) return false;
    if (deliveryDateTo && (!order.deliveryDate || order.deliveryDate > deliveryDateTo)) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Panell d'Oficina"
        subtitle="Vista tabular de totes les comandes. Fes clic en una fila per veure'n les línies."
        right={<StatCard label="COMANDES VISIBLES" value={filtered.length} />}
      />

      <FilterBar>
        <div className="flex w-full flex-wrap gap-4">
          <SearchInput label="Client" value={clientSearch} onChange={setClientSearch} />
          <SelectFilter
            label="Estat"
            options={[ALL, "Oberta", "Incidència"]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <SelectFilter
            label="Transportista"
            options={[ALL, ...carriers.map((item) => item.name)]}
            value={carrierFilter}
            onChange={setCarrierFilter}
          />
          <SelectFilter
            label="Tarifa"
            options={[ALL_FEM, ...tariffColumns.map((item) => item.name)]}
            value={tariffFilter}
            onChange={setTariffFilter}
          />
        </div>
        <div className="flex w-full flex-wrap gap-4">
          <SelectFilter
            label="Població de destí"
            options={destinationOptions}
            value={destinationFilter}
            onChange={setDestinationFilter}
          />
          <DateRangeInput
            label="Data comanda"
            from={orderDateFrom}
            to={orderDateTo}
            onFromChange={setOrderDateFrom}
            onToChange={setOrderDateTo}
          />
          <DateRangeInput
            label="Data expedició"
            from={shippingDateFrom}
            to={shippingDateTo}
            onFromChange={setShippingDateFrom}
            onToChange={setShippingDateTo}
          />
          <DateRangeInput
            label="Data lliurament"
            from={deliveryDateFrom}
            to={deliveryDateTo}
            onFromChange={setDeliveryDateFrom}
            onToChange={setDeliveryDateTo}
          />
        </div>
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar les comandes.</p>}

      {!isLoading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="w-[7%] px-2 py-2 text-left font-medium text-gray-500">Núm.</th>
                <th className="w-[12%] px-2 py-2 text-left font-medium text-gray-500">Client</th>
                <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500">Població de destí</th>
                <th className="w-[6%] px-2 py-2 text-left font-medium text-gray-500">Tarifa</th>
                <th className="w-[8%] px-2 py-2 text-left font-medium text-gray-500 break-words">Transportista</th>
                <th className="w-[8%] px-2 py-2 text-left font-medium text-gray-500">Estat</th>
                <th className="w-[6%] px-2 py-2 text-left font-medium text-gray-500 break-words">Data comanda</th>
                <th className="w-[6%] px-2 py-2 text-left font-medium text-gray-500 break-words">Data expedició</th>
                <th className="w-[6%] px-2 py-2 text-left font-medium text-gray-500 break-words">Data lliurament</th>
                <th className="w-[9%] px-2 py-2 text-right font-medium text-gray-500">Total kg demanats</th>
                <th className="w-[6%] px-2 py-2 text-right font-medium text-gray-500">Núm. bultos</th>
                <th className="w-[8%] px-2 py-2 text-center font-medium text-gray-500 break-words">Obs. producció</th>
                <th className="w-[9%] px-2 py-2 text-center font-medium text-gray-500 break-words">Obs. lliurament</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const client = clients.find((item) => item.code === order.clientCode);
                const tariff = tariffColumns.find((item) => item.code === order.tariffCode);
                const carrier = carriers.find((item) => item.code === order.carrierCode);
                return (
                  <tr
                    key={order.number}
                    onClick={() => router.push(`/office/${order.number}`)}
                    className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-2 py-3">
                      <span className="font-semibold text-gray-900">{order.number}</span>
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{client?.name ?? order.clientCode}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.poblacioDesti || "—"}</td>
                    <td className="px-2 py-3 text-gray-900">{tariff?.name ?? "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{carrier?.name ?? "—"}</td>
                    <td className="px-2 py-3">
                      <Badge variant={order.status === "Incidència" ? "negative" : "info"}>{order.status}</Badge>
                    </td>
                    <td className="px-2 py-3 text-gray-900">{formatDateShort(order.orderDate)}</td>
                    <td className="px-2 py-3 text-gray-900">
                      {order.shippingDate ? formatDateShort(order.shippingDate) : "—"}
                    </td>
                    <td className="px-2 py-3 text-gray-900">
                      {order.deliveryDate ? formatDateShort(order.deliveryDate) : "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-gray-900">{formatKg(sumOrderedWeightKg(order.lines))}</td>
                    <td className="px-2 py-3 text-right text-gray-900">{order.packageCount}</td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={order.productionNotes.trim().length > 0}
                        disabled
                        className="h-4 w-4 rounded border-gray-300 text-ink"
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={order.deliveryNotes.trim().length > 0}
                        disabled
                        className="h-4 w-4 rounded border-gray-300 text-ink"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
