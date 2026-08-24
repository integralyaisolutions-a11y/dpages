"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateInput } from "@/components/ui/DateInput";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/DataTable";
import { useCarriers } from "@/hooks/useCarriers";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useOrders } from "@/hooks/useOrders";
import { useRates } from "@/hooks/useRates";
import { aggregateProductionDates, formatDateDisplay } from "@/lib/orderCalculations";

const ALL = "Tots";

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
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Núm.</TableHeaderCell>
              <TableHeaderCell>Client</TableHeaderCell>
              <TableHeaderCell>Tarifa</TableHeaderCell>
              <TableHeaderCell>Data comanda</TableHeaderCell>
              <TableHeaderCell>Data producció</TableHeaderCell>
              <TableHeaderCell>Data lliurament</TableHeaderCell>
              <TableHeaderCell>Transportista</TableHeaderCell>
              <TableHeaderCell align="right">Bultos</TableHeaderCell>
              <TableHeaderCell>Estat</TableHeaderCell>
              <TableHeaderCell align="right">Accions</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {filtered.map((order) => {
              const client = clients.find((item) => item.code === order.clientCode);
              const tariff = tariffColumns.find((item) => item.code === order.tariffCode);
              const carrier = carriers.find((item) => item.code === order.carrierCode);
              return (
                <TableRow key={order.number} onClick={() => router.push(`/orders/${order.number}`)}>
                  <TableCell>
                    <span className="font-semibold text-gray-900">{order.number}</span>
                  </TableCell>
                  <TableCell>{client?.name ?? order.clientCode}</TableCell>
                  <TableCell>{tariff?.name ?? "—"}</TableCell>
                  <TableCell>{formatDateDisplay(order.orderDate)}</TableCell>
                  <TableCell>{aggregateProductionDates(order.lines) || "—"}</TableCell>
                  <TableCell>{order.deliveryDate ? formatDateDisplay(order.deliveryDate) : "—"}</TableCell>
                  <TableCell>{carrier?.name ?? "—"}</TableCell>
                  <TableCell align="right">{order.packageCount}</TableCell>
                  <TableCell>
                    <Badge variant={order.status === "Incidència" ? "negative" : "info"}>{order.status}</Badge>
                  </TableCell>
                  <TableCell align="right">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
