"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataCard, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateRangeInput } from "@/components/ui/DateRangeInput";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import { useCarriers } from "@/hooks/useCarriers";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useMockOrdersDetail } from "@/hooks/useMockOrdersDetail";
import { useRates } from "@/hooks/useRates";
import type { ComandaDetallApi } from "@/lib/api";
import { formatData } from "@/lib/dates";
import { sumOrderedWeightKg } from "@/lib/orderCalculations";

const ALL = "Tots";
const ALL_FEM = "Totes";

const ESTAT_LABELS: Record<string, string> = {
  oberta: "Oberta",
  en_proces: "En procés",
  tancada: "Tancada",
  amb_incidencia: "Amb incidència",
};

function formatKg(value: number) {
  return `${value.toFixed(3).replace(".", ",")}`;
}

function OfficeOrderCard({ order, onClick }: { order: ComandaDetallApi; onClick: () => void }) {
  return (
    <DataCard onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{order.num}</p>
          <p className="text-sm text-gray-500">{order.client?.nom ?? "—"}</p>
        </div>
        <Badge variant={order.estat === "amb_incidencia" ? "negative" : "info"}>
          {ESTAT_LABELS[order.estat] ?? order.estat}
        </Badge>
      </div>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Població de destí">{order.poblacioDesti || "—"}</DataCardField>
          <DataCardField label="Tarifa">{order.tarifa?.nom ?? "—"}</DataCardField>
          <DataCardField label="Transportista">{order.transportista?.nom ?? "—"}</DataCardField>
          <DataCardField label="Total kg demanats">{formatKg(sumOrderedWeightKg(order.linies))}</DataCardField>
          <DataCardField label="Data comanda">{formatData(order.dataComanda, false)}</DataCardField>
          <DataCardField label="Data expedició">
            {order.dataExpedicio ? formatData(order.dataExpedicio, true) : "—"}
          </DataCardField>
          <DataCardField label="Data lliurament">
            {order.dataLliurament ? formatData(order.dataLliurament, true) : "—"}
          </DataCardField>
          <DataCardField label="Núm. bultos">{order.bultos ?? "—"}</DataCardField>
        </DataCardGrid>
      </div>

      <div className="mt-3 flex gap-6 border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={(order.obsProduccio ?? "").trim().length > 0}
            disabled
            className="h-4 w-4 rounded border-gray-300 text-ink"
          />
          Obs. producció
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={(order.obsLliurament ?? "").trim().length > 0}
            disabled
            className="h-4 w-4 rounded border-gray-300 text-ink"
          />
          Obs. lliurament
        </label>
      </div>
    </DataCard>
  );
}

export default function OfficePage() {
  const router = useRouter();
  const { data, isLoading, error } = useMockOrdersDetail();
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
    () => [ALL_FEM, ...Array.from(new Set(data.map((order) => order.poblacioDesti ?? "—")))],
    [data],
  );

  const filtered = data.filter((order) => {
    if (clientSearch) {
      // El resumen del pedido sólo trae {id, nom} del cliente — el codi se
      // cruza contra el listado completo de clients (contrato §4.4).
      const client = clients.find((item) => item.id === order.client?.id);
      const term = clientSearch.toLowerCase();
      const matches =
        order.client?.nom.toLowerCase().includes(term) || (client?.codi ?? "").toLowerCase().includes(term);
      if (!matches) return false;
    }
    if (statusFilter !== ALL && (ESTAT_LABELS[order.estat] ?? order.estat) !== statusFilter) return false;
    if (carrierFilter !== ALL && (order.transportista?.nom ?? "—") !== carrierFilter) return false;
    if (tariffFilter !== ALL_FEM && (order.tarifa?.nom ?? "—") !== tariffFilter) return false;
    if (destinationFilter !== ALL_FEM && (order.poblacioDesti ?? "—") !== destinationFilter) return false;
    const dataComanda = order.dataComanda.slice(0, 10);
    const dataExpedicio = order.dataExpedicio?.slice(0, 10);
    const dataLliurament = order.dataLliurament?.slice(0, 10);
    if (orderDateFrom && dataComanda < orderDateFrom) return false;
    if (orderDateTo && dataComanda > orderDateTo) return false;
    if (shippingDateFrom && (!dataExpedicio || dataExpedicio < shippingDateFrom)) return false;
    if (shippingDateTo && (!dataExpedicio || dataExpedicio > shippingDateTo)) return false;
    if (deliveryDateFrom && (!dataLliurament || dataLliurament < deliveryDateFrom)) return false;
    if (deliveryDateTo && (!dataLliurament || dataLliurament > deliveryDateTo)) return false;
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
            options={[ALL, ...Object.values(ESTAT_LABELS)]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <SelectFilter
            label="Transportista"
            options={[ALL, ...carriers.map((item) => item.nom)]}
            value={carrierFilter}
            onChange={setCarrierFilter}
          />
          <SelectFilter
            label="Tarifa"
            options={[ALL_FEM, ...tariffColumns.map((item) => item.nom)]}
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
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {filtered.map((order) => (
              <OfficeOrderCard key={order.num} order={order} onClick={() => router.push(`/office/${order.num}`)} />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[7%] px-2 py-2 text-left font-medium text-gray-500 break-words">Núm.</th>
                  <th className="w-[12%] px-2 py-2 text-left font-medium text-gray-500 break-words">Client</th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Població de destí
                  </th>
                  <th className="w-[6%] px-2 py-2 text-left font-medium text-gray-500 break-words">Tarifa</th>
                  <th className="w-[8%] px-2 py-2 text-left font-medium text-gray-500 break-words">Transportista</th>
                  <th className="w-[8%] px-2 py-2 text-left font-medium text-gray-500 break-words">Estat</th>
                  <th className="w-[6%] px-2 py-2 text-left font-medium text-gray-500 break-words">Data comanda</th>
                  <th className="w-[6%] px-2 py-2 text-left font-medium text-gray-500 break-words">Data expedició</th>
                  <th className="w-[6%] px-2 py-2 text-left font-medium text-gray-500 break-words">Data lliurament</th>
                  <th className="w-[9%] px-2 py-2 text-right font-medium text-gray-500 break-words">
                    Total kg demanats
                  </th>
                  <th className="w-[6%] px-2 py-2 text-right font-medium text-gray-500 break-words">Núm. bultos</th>
                  <th className="w-[8%] px-2 py-2 text-center font-medium text-gray-500 break-words">
                    Obs. producció
                  </th>
                  <th className="w-[9%] px-2 py-2 text-center font-medium text-gray-500 break-words">
                    Obs. lliurament
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr
                    key={order.num}
                    onClick={() => router.push(`/office/${order.num}`)}
                    className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-2 py-3 break-words">
                      <span className="font-semibold text-gray-900">{order.num}</span>
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.client?.nom ?? "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.poblacioDesti || "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.tarifa?.nom ?? "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.transportista?.nom ?? "—"}</td>
                    <td className="px-2 py-3">
                      <Badge variant={order.estat === "amb_incidencia" ? "negative" : "info"}>
                        {ESTAT_LABELS[order.estat] ?? order.estat}
                      </Badge>
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{formatData(order.dataComanda, false)}</td>
                    <td className="px-2 py-3 break-words text-gray-900">
                      {order.dataExpedicio ? formatData(order.dataExpedicio, true) : "—"}
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">
                      {order.dataLliurament ? formatData(order.dataLliurament, true) : "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-gray-900">
                      {formatKg(sumOrderedWeightKg(order.linies))}
                    </td>
                    <td className="px-2 py-3 text-right text-gray-900">{order.bultos ?? "—"}</td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={(order.obsProduccio ?? "").trim().length > 0}
                        disabled
                        className="h-4 w-4 rounded border-gray-300 text-ink"
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={(order.obsLliurament ?? "").trim().length > 0}
                        disabled
                        className="h-4 w-4 rounded border-gray-300 text-ink"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
