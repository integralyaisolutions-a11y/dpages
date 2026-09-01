"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { DataCard, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateRangeInput } from "@/components/ui/DateRangeInput";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import { useCarriers } from "@/hooks/useCarriers";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { usePanellOficina } from "@/hooks/usePanellOficina";
import { useRates } from "@/hooks/useRates";
import type { ClientApi, FilaPanellOficinaApi } from "@/lib/api";
import { formatData } from "@/lib/dates";
import { formatDecimal } from "@/lib/decimals";

const ALL = "Tots";
const ALL_FEM = "Totes";

const ESTAT_LABELS: Record<string, string> = {
  oberta: "Oberta",
  en_proces: "En procés",
  tancada: "Tancada",
  amb_incidencia: "Amb incidència",
};

function clientLabel(client: ClientApi) {
  return `${client.codi ?? client.id} · ${client.nom ?? ""}`;
}

function OfficeOrderCard({ order, onClick }: { order: FilaPanellOficinaApi; onClick: () => void }) {
  return (
    <DataCard onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{order.num}</p>
          <p className="text-sm text-gray-500">{order.client ?? "—"}</p>
        </div>
        <Badge variant={order.estat === "amb_incidencia" ? "negative" : "info"}>
          {ESTAT_LABELS[order.estat] ?? order.estat}
        </Badge>
      </div>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Població de destí">{order.poblacioDesti || "—"}</DataCardField>
          <DataCardField label="Tarifa">{order.tarifa ?? "—"}</DataCardField>
          <DataCardField label="Transportista">{order.transportista ?? "—"}</DataCardField>
          <DataCardField label="Total kg demanats">{formatDecimal(order.totalKg, 3)}</DataCardField>
          <DataCardField label="Núm. bultos">{order.bultos ?? "—"}</DataCardField>
          <DataCardField label="Data comanda">{formatData(order.dataComanda, true)}</DataCardField>
          <DataCardField label="Data expedició">
            {order.dataExpedicio ? formatData(order.dataExpedicio, false) : "—"}
          </DataCardField>
          <DataCardField label="Data lliurament">
            {order.dataLliurament ? formatData(order.dataLliurament, false) : "—"}
          </DataCardField>
        </DataCardGrid>
      </div>

      <div className="mt-3 flex gap-6 border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          {/* Capa 35 — FilaPanellOficinaApi.obsProduccio ya es boolean acá
              (cabecera O línia activa), el backend ja fa el càlcul. NO és
              string: cap .trim() acá (a diferència del detall, on
              ComandaLiniaApi.obsProduccio segueix sent string | null). */}
          <input
            type="checkbox"
            checked={order.obsProduccio}
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
  const { data: clients } = useClientTariffs();
  const { tariffColumns } = useRates();
  const { data: carriers } = useCarriers();

  // Capa 35 — els 8 filtres reals de GET /panells/oficina, tots connectats.
  const [clientFilter, setClientFilter] = useState(ALL);
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

  const statusCode = useMemo(
    () => Object.entries(ESTAT_LABELS).find(([, label]) => label === statusFilter)?.[0],
    [statusFilter],
  );
  const carrierId = useMemo(
    () => (carrierFilter !== ALL ? carriers.find((item) => item.nom === carrierFilter)?.id : undefined),
    [carrierFilter, carriers],
  );
  const clientId = useMemo(
    () => (clientFilter !== ALL ? clients.find((item) => clientLabel(item) === clientFilter)?.id : undefined),
    [clientFilter, clients],
  );
  const tariffId = useMemo(
    () => (tariffFilter !== ALL_FEM ? tariffColumns.find((item) => item.nom === tariffFilter)?.id : undefined),
    [tariffFilter, tariffColumns],
  );

  const filters = useMemo(
    () => ({
      ...(statusCode ? { estat: statusCode } : {}),
      ...(carrierId !== undefined ? { transportistaId: carrierId } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
      ...(tariffId !== undefined ? { tarifaId: tariffId } : {}),
      ...(destinationFilter !== ALL_FEM ? { poblacioDesti: destinationFilter } : {}),
      ...(orderDateFrom ? { dataComandaDes: orderDateFrom } : {}),
      ...(orderDateTo ? { dataComandaFins: orderDateTo } : {}),
      ...(shippingDateFrom ? { dataExpedicioDes: shippingDateFrom } : {}),
      ...(shippingDateTo ? { dataExpedicioFins: shippingDateTo } : {}),
      ...(deliveryDateFrom ? { dataLliuramentDes: deliveryDateFrom } : {}),
      ...(deliveryDateTo ? { dataLliuramentFins: deliveryDateTo } : {}),
    }),
    [
      statusCode,
      carrierId,
      clientId,
      tariffId,
      destinationFilter,
      orderDateFrom,
      orderDateTo,
      shippingDateFrom,
      shippingDateTo,
      deliveryDateFrom,
      deliveryDateTo,
    ],
  );

  const { data, totals, paginacio, setPagina, isLoading, error, refetch } = usePanellOficina(filters);

  // Població de destí no té cap catàleg propi (és text lliure a
  // `comanda.poblacio_desti`, no una entitat com client/tarifa/
  // transportista) — les opcions es deriven de `data`, l'únic univers
  // disponible sense un endpoint dedicat. Es descarten els nulls: no hi ha
  // manera de filtrar per "sense població" contra un backend que compara
  // per igualtat exacta de text (enviar-ho literal no matchejaria res).
  // LIMITACIÓ CONEGUDA amb paginació real (2026-08-30): només reflecteix
  // les poblacions presents a la pàgina actual (20 comandes), no totes les
  // que existeixen — no hi ha cap fix net possible sense un endpoint nou.
  const destinationOptions = useMemo(
    () => [
      ALL_FEM,
      ...Array.from(new Set(data.map((order) => order.poblacioDesti).filter((value): value is string => value !== null))),
    ],
    [data],
  );

  return (
    <div>
      <PageHeader
        title="Panell d'Oficina"
        subtitle="Vista tabular de totes les comandes. Fes clic en una fila per veure'n les línies."
        right={<StatCard label="COMANDES VISIBLES" value={totals?.comandes ?? 0} />}
      />

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;han pogut carregar les comandes: {error.message}</p>
          <button
            type="button"
            onClick={refetch}
            className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Torna-ho a provar
          </button>
        </div>
      )}

      <FilterBar>
        <div className="flex w-full flex-wrap gap-4">
          <SelectFilter
            label="Client"
            options={[ALL, ...clients.map((item) => clientLabel(item))]}
            value={clientFilter}
            onChange={setClientFilter}
          />
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

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {data.map((order) => (
              <OfficeOrderCard
                key={order.comandaId}
                order={order}
                onClick={() => router.push(`/office/${order.comandaId}`)}
              />
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
                {data.map((order) => (
                  <tr
                    key={order.comandaId}
                    onClick={() => router.push(`/office/${order.comandaId}`)}
                    className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-2 py-3 break-words">
                      <span className="font-semibold text-gray-900">{order.num}</span>
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.client ?? "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.poblacioDesti || "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.tarifa ?? "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.transportista ?? "—"}</td>
                    <td className="px-2 py-3">
                      <Badge variant={order.estat === "amb_incidencia" ? "negative" : "info"}>
                        {ESTAT_LABELS[order.estat] ?? order.estat}
                      </Badge>
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{formatData(order.dataComanda, true)}</td>
                    <td className="px-2 py-3 break-words text-gray-900">
                      {order.dataExpedicio ? formatData(order.dataExpedicio, false) : "—"}
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">
                      {order.dataLliurament ? formatData(order.dataLliurament, false) : "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-gray-900">{formatDecimal(order.totalKg, 3)}</td>
                    <td className="px-2 py-3 text-right text-gray-900">{order.bultos ?? "—"}</td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={order.obsProduccio}
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

          {paginacio && <Pagination paginacio={paginacio} onPageChange={setPagina} />}
        </>
      )}
    </div>
  );
}
