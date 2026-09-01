"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataCard, DataCardActions, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateInput } from "@/components/ui/DateInput";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useOrders } from "@/hooks/useOrders";
import { useOrigensComanda } from "@/hooks/useOrigensComanda";
import { ApiError, type ComandaResumApi } from "@/lib/api";
import { origenBadgeVariant } from "@/lib/comandaOrigen";
import { formatData } from "@/lib/dates";

const ALL = "Tots";

const ESTAT_LABELS: Record<string, string> = {
  oberta: "Oberta",
  en_proces: "En procés",
  tancada: "Tancada",
  amb_incidencia: "Amb incidència",
};

function productionDates(order: ComandaResumApi): string {
  return order.datesProduccioLinies.map((data) => formatData(data, false)).join(", ");
}

function OrderCard({
  order,
  originLabel,
  onOpen,
  onMarkIncidence,
}: {
  order: ComandaResumApi;
  originLabel: (codi: string) => string;
  onOpen: () => void;
  onMarkIncidence: () => void;
}) {
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{order.num}</p>
          <p className="text-sm text-gray-500">{order.client?.nom ?? "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={order.estat === "amb_incidencia" ? "negative" : "info"}>
            {ESTAT_LABELS[order.estat] ?? order.estat}
          </Badge>
          {order.congelada && <Badge variant="neutral">Congelada</Badge>}
        </div>
      </div>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Origen">
            <Badge variant={origenBadgeVariant(order.origen)}>{originLabel(order.origen)}</Badge>
          </DataCardField>
          <DataCardField label="Tarifa">{order.tarifa?.nom ?? "—"}</DataCardField>
          <DataCardField label="Transportista">{order.transportista?.nom ?? "—"}</DataCardField>
          <DataCardField label="Data comanda">{formatData(order.dataComanda, true)}</DataCardField>
          <DataCardField label="Data producció">{productionDates(order) || "—"}</DataCardField>
          <DataCardField label="Data lliurament">
            {order.dataLliurament ? formatData(order.dataLliurament, false) : "—"}
          </DataCardField>
          <DataCardField label="Bultos">{order.bultos ?? "—"}</DataCardField>
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
        {order.estat !== "amb_incidencia" && (
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

  const [orderNumberSearch, setOrderNumberSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [productionDateFilter, setProductionDateFilter] = useState("");
  const [orderDateFilter, setOrderDateFilter] = useState("");
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  const [incidenceTarget, setIncidenceTarget] = useState<ComandaResumApi | null>(null);
  const [incidenceDetall, setIncidenceDetall] = useState("");
  const [incidenceError, setIncidenceError] = useState<string | null>(null);
  const [isMarkingIncidence, setIsMarkingIncidence] = useState(false);

  const statusCode = useMemo(
    () => Object.entries(ESTAT_LABELS).find(([, label]) => label === statusFilter)?.[0],
    [statusFilter],
  );

  // Els 6 filtres de la pantalla tenen suport real a GET /comandes, excepte
  // la cerca de client per nom (el backend només filtra per clientId
  // numèric) — aquesta es manté client-side sobre el resultat ja filtrat
  // pel servidor, mateix criteri que ja feia servir aquesta pantalla.
  const filters = useMemo(
    () => ({
      ...(statusCode ? { estat: statusCode } : {}),
      ...(orderDateFilter ? { dataDes: orderDateFilter, dataFins: orderDateFilter } : {}),
      ...(productionDateFilter
        ? { dataProduccioDes: productionDateFilter, dataProduccioFins: productionDateFilter }
        : {}),
      ...(deliveryDateFilter
        ? { dataLliuramentDes: deliveryDateFilter, dataLliuramentFins: deliveryDateFilter }
        : {}),
      ...(orderNumberSearch.trim() ? { cerca: orderNumberSearch.trim() } : {}),
    }),
    [statusCode, orderDateFilter, productionDateFilter, deliveryDateFilter, orderNumberSearch],
  );

  const { data, paginacio, setPagina, isLoading, error, refetch, markIncidence } = useOrders(filters);
  // useClientTariffs() SENSE paràmetres: taula de consulta completa per
  // resoldre el codi de client (manté `mida: 200` per defecte, no es toca).
  const { data: clients } = useClientTariffs();
  const { data: origins } = useOrigensComanda();
  const originLabel = useMemo(() => {
    const byCodi = new Map(origins.map((origin) => [origin.codi, origin.nom]));
    return (codi: string) => byCodi.get(codi) ?? codi;
  }, [origins]);

  // El buscador de client segueix sent client-side sobre la pàgina actual
  // (20 comandes) des que hi ha paginació real — GET /comandes no accepta
  // cerca de text lliure per nom de client (confirmat contra comandes.ts,
  // només `clientId` numèric exacte). Pendent de decidir si val la pena
  // afegir suport real al backend.
  const filtered = data.filter((order) => {
    if (!clientSearch) return true;
    // ComandaResumApi.client sólo trae {id, nom, poblacio} (contrato §4.5) —
    // el codi se cruza contra el listado completo de clients (§4.4).
    const client = clients.find((item) => item.id === order.client?.id);
    const term = clientSearch.toLowerCase();
    return order.client?.nom.toLowerCase().includes(term) || (client?.codi ?? "").toLowerCase().includes(term);
  });

  async function handleConfirmIncidence() {
    if (!incidenceTarget) return;
    setIsMarkingIncidence(true);
    setIncidenceError(null);
    try {
      await markIncidence(incidenceTarget.id, incidenceDetall.trim());
      setIncidenceTarget(null);
      setIncidenceDetall("");
    } catch (caught) {
      setIncidenceError(caught instanceof ApiError ? caught.message : "No s'ha pogut marcar la incidència.");
    } finally {
      setIsMarkingIncidence(false);
    }
  }

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
          options={[ALL, ...Object.values(ESTAT_LABELS)]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <DateInput label="Data producció" value={productionDateFilter} onChange={setProductionDateFilter} />
        <DateInput label="Data comanda" value={orderDateFilter} onChange={setOrderDateFilter} />
        <DateInput label="Data lliurament" value={deliveryDateFilter} onChange={setDeliveryDateFilter} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;han pogut carregar les comandes: {error.message}</p>
          <button
            type="button"
            onClick={refetch}
            className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-3 xl:hidden">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                originLabel={originLabel}
                onOpen={() => router.push(`/orders/${order.id}`)}
                onMarkIncidence={() => {
                  setIncidenceError(null);
                  setIncidenceDetall("");
                  setIncidenceTarget(order);
                }}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[8%] px-2 py-2 text-left font-medium text-gray-500 break-words">Núm.</th>
                  <th className="w-[13%] px-2 py-2 text-left font-medium text-gray-500 break-words">Client</th>
                  <th className="w-[7%] px-2 py-2 text-left font-medium text-gray-500 break-words">Origen</th>
                  <th className="w-[8%] px-2 py-2 text-left font-medium text-gray-500 break-words">Tarifa</th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">Data comanda</th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Data producció
                  </th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Data lliurament
                  </th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">
                    Transportista
                  </th>
                  <th className="w-[6%] px-2 py-2 text-right font-medium text-gray-500 break-words">Bultos</th>
                  <th className="w-[9%] px-2 py-2 text-left font-medium text-gray-500 break-words">Estat</th>
                  <th className="w-[13%] px-2 py-2 text-right font-medium text-gray-500 break-words">Accions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/orders/${order.id}`)}
                    className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-2 py-3 break-words">
                      <span className="font-semibold text-gray-900">{order.num}</span>
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.client?.nom ?? "—"}</td>
                    <td className="px-2 py-3 break-words">
                      <Badge variant={origenBadgeVariant(order.origen)}>{originLabel(order.origen)}</Badge>
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.tarifa?.nom ?? "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{formatData(order.dataComanda, true)}</td>
                    <td className="px-2 py-3 break-words text-gray-900">{productionDates(order) || "—"}</td>
                    <td className="px-2 py-3 break-words text-gray-900">
                      {order.dataLliurament ? formatData(order.dataLliurament, false) : "—"}
                    </td>
                    <td className="px-2 py-3 break-words text-gray-900">{order.transportista?.nom ?? "—"}</td>
                    <td className="px-2 py-3 text-right text-gray-900">{order.bultos ?? "—"}</td>
                    <td className="px-2 py-3 break-words">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={order.estat === "amb_incidencia" ? "negative" : "info"}>
                          {ESTAT_LABELS[order.estat] ?? order.estat}
                        </Badge>
                        {order.congelada && <Badge variant="neutral">Congelada</Badge>}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div onClick={(event) => event.stopPropagation()} className="flex justify-end gap-1">
                        <IconButton
                          variant="edit"
                          label="Editar comanda"
                          onClick={() => router.push(`/orders/${order.id}`)}
                        />
                        {order.estat !== "amb_incidencia" && (
                          <IconButton
                            variant="warning"
                            label="Marcar com a incidència"
                            onClick={() => {
                              setIncidenceError(null);
                              setIncidenceDetall("");
                              setIncidenceTarget(order);
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginacio && <Pagination paginacio={paginacio} onPageChange={setPagina} />}
        </>
      )}

      <ConfirmDialog
        isOpen={incidenceTarget !== null}
        title="Marcar com a incidència"
        message={`Vols marcar la comanda ${incidenceTarget?.num ?? ""} com a incidència?`}
        confirmLabel="Marcar"
        confirmingLabel="Marcant..."
        cancelLabel="Cancel·lar"
        errorMessage={incidenceError}
        isConfirming={isMarkingIncidence}
        detailField={{
          label: "Motiu",
          value: incidenceDetall,
          onChange: setIncidenceDetall,
          placeholder: "Explica per què es marca aquesta comanda com a incidència",
        }}
        onConfirm={handleConfirmIncidence}
        onCancel={() => {
          setIncidenceTarget(null);
          setIncidenceError(null);
          setIncidenceDetall("");
        }}
      />
    </div>
  );
}
