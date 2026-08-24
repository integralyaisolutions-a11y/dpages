"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataCard, DataCardActions, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateInput } from "@/components/ui/DateInput";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useCarriers } from "@/hooks/useCarriers";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useOrders } from "@/hooks/useOrders";
import { useRates } from "@/hooks/useRates";
import type { CarrierApi, ClientTariffApi, OrderApi, TariffApi } from "@/lib/api";
import { aggregateProductionDates, formatDateDisplay } from "@/lib/orderCalculations";

const ALL = "Tots";

function OrderCard({
  order,
  client,
  tariff,
  carrier,
  onOpen,
  onMarkIncidence,
}: {
  order: OrderApi;
  client?: ClientTariffApi;
  tariff?: TariffApi;
  carrier?: CarrierApi;
  onOpen: () => void;
  onMarkIncidence: () => void;
}) {
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{order.number}</p>
          <p className="text-sm text-gray-500">{client?.name ?? order.clientCode}</p>
        </div>
        <Badge variant={order.status === "Incidència" ? "negative" : "info"}>{order.status}</Badge>
      </div>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Tarifa">{tariff?.name ?? "—"}</DataCardField>
          <DataCardField label="Transportista">{carrier?.name ?? "—"}</DataCardField>
          <DataCardField label="Data comanda">{formatDateDisplay(order.orderDate)}</DataCardField>
          <DataCardField label="Data producció">{aggregateProductionDates(order.lines) || "—"}</DataCardField>
          <DataCardField label="Data lliurament">
            {order.deliveryDate ? formatDateDisplay(order.deliveryDate) : "—"}
          </DataCardField>
          <DataCardField label="Bultos">{order.packageCount}</DataCardField>
        </DataCardGrid>
      </div>

      <DataCardActions>
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Editar
        </button>
        {order.status !== "Incidència" && (
          <button
            type="button"
            onClick={onMarkIncidence}
            className="flex-1 rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Marcar incidència
          </button>
        )}
      </DataCardActions>
    </DataCard>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { data, isLoading, error, markIncidence } = useOrders();
  const { data: clients } = useClientTariffs();
  const { tariffColumns } = useRates();
  const { data: carriers } = useCarriers();

  const [orderNumberSearch, setOrderNumberSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [productionDateFilter, setProductionDateFilter] = useState("");
  const [orderDateFilter, setOrderDateFilter] = useState("");
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  const [incidenceTarget, setIncidenceTarget] = useState<string | null>(null);

  const filtered = data.filter((order) => {
    if (orderNumberSearch && !order.number.includes(orderNumberSearch)) return false;
    if (clientSearch) {
      const client = clients.find((item) => item.code === order.clientCode);
      const term = clientSearch.toLowerCase();
      const matches =
        client?.name.toLowerCase().includes(term) || client?.code.toLowerCase().includes(term);
      if (!matches) return false;
    }
    if (statusFilter !== ALL && order.status !== statusFilter) return false;
    if (productionDateFilter && !order.lines.some((line) => line.productionDate === productionDateFilter)) {
      return false;
    }
    if (orderDateFilter && order.orderDate !== orderDateFilter) return false;
    if (deliveryDateFilter && order.deliveryDate !== deliveryDateFilter) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Comandes"
        subtitle="Manteniment de comandes de venda."
        action={{ label: "Nova comanda", onClick: () => router.push("/orders/new") }}
      />

      <FilterBar>
        <SearchInput label="Núm. comanda" value={orderNumberSearch} onChange={setOrderNumberSearch} />
        <SearchInput label="Client" value={clientSearch} onChange={setClientSearch} />
        <SelectFilter
          label="Estat"
          options={[ALL, "Oberta", "Incidència"]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <DateInput label="Data producció" value={productionDateFilter} onChange={setProductionDateFilter} />
        <DateInput label="Data comanda" value={orderDateFilter} onChange={setOrderDateFilter} />
        <DateInput label="Data lliurament" value={deliveryDateFilter} onChange={setDeliveryDateFilter} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;han pogut carregar les comandes.</p>}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {filtered.map((order) => (
              <OrderCard
                key={order.number}
                order={order}
                client={clients.find((item) => item.code === order.clientCode)}
                tariff={tariffColumns.find((item) => item.code === order.tariffCode)}
                carrier={carriers.find((item) => item.code === order.carrierCode)}
                onOpen={() => router.push(`/orders/${order.number}`)}
                onMarkIncidence={() => setIncidenceTarget(order.number)}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[8%] px-2 py-2 text-left font-medium text-gray-500 break-words">Núm.</th>
                  <th className="w-[14%] px-2 py-2 text-left font-medium text-gray-500 break-words">Client</th>
                  <th className="w-[10%] px-2 py-2 text-left font-medium text-gray-500 break-words">Tarifa</th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">Data comanda</th>
                  <th className="w-[10%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Data producció
                  </th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Data lliurament
                  </th>
                  <th className="w-[12%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Transportista
                  </th>
                  <th className="w-[7%] px-2 py-2 text-right font-medium text-gray-500 break-words">Bultos</th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">Estat</th>
                  <th className="w-[12%] px-2 py-2 text-right font-medium text-gray-500 break-words">Accions</th>
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
                      onClick={() => router.push(`/orders/${order.number}`)}
                      className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-2 py-3 break-words">
                        <span className="font-semibold text-gray-900">{order.number}</span>
                      </td>
                      <td className="px-2 py-3 break-words text-gray-900">{client?.name ?? order.clientCode}</td>
                      <td className="px-2 py-3 break-words text-gray-900">{tariff?.name ?? "—"}</td>
                      <td className="px-2 py-3 break-words text-gray-900">{formatDateDisplay(order.orderDate)}</td>
                      <td className="px-2 py-3 break-words text-gray-900">
                        {aggregateProductionDates(order.lines) || "—"}
                      </td>
                      <td className="px-2 py-3 break-words text-gray-900">
                        {order.deliveryDate ? formatDateDisplay(order.deliveryDate) : "—"}
                      </td>
                      <td className="px-2 py-3 break-words text-gray-900">{carrier?.name ?? "—"}</td>
                      <td className="px-2 py-3 text-right text-gray-900">{order.packageCount}</td>
                      <td className="px-2 py-3 break-words">
                        <Badge variant={order.status === "Incidència" ? "negative" : "info"}>{order.status}</Badge>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <div onClick={(event) => event.stopPropagation()} className="flex justify-end gap-1">
                          <IconButton
                            variant="edit"
                            label="Editar comanda"
                            onClick={() => router.push(`/orders/${order.number}`)}
                          />
                          {order.status !== "Incidència" && (
                            <IconButton
                              variant="warning"
                              label="Marcar com a incidència"
                              onClick={() => setIncidenceTarget(order.number)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={incidenceTarget !== null}
        title="Marcar com a incidència"
        message={`Vols marcar la comanda ${incidenceTarget ?? ""} com a incidència?`}
        confirmLabel="Marcar"
        cancelLabel="Cancel·lar"
        onConfirm={() => {
          if (incidenceTarget) markIncidence(incidenceTarget);
          setIncidenceTarget(null);
        }}
        onCancel={() => setIncidenceTarget(null)}
      />
    </div>
  );
}
