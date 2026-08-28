"use client";

import { useMemo, useState } from "react";
import { ClearFiltersButton, FilterBar } from "@/components/ui/FilterBar";
import { DataCard, DataCardActions, DataCardField, DataCardGrid } from "@/components/ui/DataCard";
import { DateInput } from "@/components/ui/DateInput";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/SelectFilter";
import { StatCard } from "@/components/ui/StatCard";
import { useCarriers } from "@/hooks/useCarriers";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useEditableRow } from "@/hooks/useEditableRow";
import { type LliuramentSaveResult, usePanellEmpaquetat } from "@/hooks/usePanellEmpaquetat";
import type { ClientApi, FilaPanellEmpaquetatApi } from "@/lib/api";
import { formatData } from "@/lib/dates";
import { formatDecimal, parseDecimalInput } from "@/lib/decimals";

const ALL = "Tots";
const ALL_FEM = "Totes";

function clientLabel(client: ClientApi) {
  return `${client.codi ?? client.id} · ${client.nom ?? ""}`;
}

type Draft = { unitatsLliurades: string; kgLliurats: string };

function PackagingRow({
  line,
  onSave,
}: {
  line: FilaPanellEmpaquetatApi;
  onSave: (comandaId: number, liniaId: number, unitatsLliurades: number, kgLliurats: string) => Promise<LliuramentSaveResult>;
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const initialValues: Draft = {
    unitatsLliurades: String(line.unitatsLliurades),
    kgLliurats: line.kgLliurats,
  };

  const { draft, setField, save, isDirty } = useEditableRow(initialValues, async (values) => {
    // El PATCH exigeix els dos camps sempre junts (contrato §5) — encara
    // que la fila només hagi tocat un dels dos, es manda el valor actual
    // del que no es va tocar més el nou de l'altre.
    const unitatsLliurades = Number(values.unitatsLliurades.replace(",", "."));
    const kgLliurats = parseDecimalInput(values.kgLliurats, 3);

    setIsSaving(true);
    setFieldErrors({});
    setGeneralError(null);
    const result = await onSave(line.comandaId, line.liniaId, unitatsLliurades, kgLliurats);
    setIsSaving(false);

    if (!result.success) {
      setFieldErrors(result.fieldErrors);
      setGeneralError(result.generalError);
    }
  });

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3 py-3 break-words text-gray-900">
        {line.dataExpedicio ? formatData(line.dataExpedicio, false) : "—"}
      </td>
      <td className="px-3 py-3 break-words text-gray-900">
        {line.dataLliurament ? formatData(line.dataLliurament, false) : "—"}
      </td>
      <td className="px-3 py-3 break-words text-gray-900">{line.transportista ?? "—"}</td>
      <td className="px-3 py-3 break-words">
        <span className="font-semibold text-gray-900">{line.producte}</span>
      </td>
      <td className="px-3 py-3 break-words text-gray-900">{line.client ?? "—"}</td>
      <td className="px-3 py-3 text-right text-gray-900">{line.unitatsDemanades}</td>
      <td className="px-3 py-3">
        <input
          type="number"
          step="1"
          value={draft.unitatsLliurades}
          onChange={(event) => setField("unitatsLliurades", event.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
        />
        {fieldErrors.unitatsLliurades && <p className="mt-1 text-xs text-red-600">{fieldErrors.unitatsLliurades}</p>}
      </td>
      <td className="px-3 py-3 text-right text-gray-900">{formatDecimal(line.kgDemanats, 3)}</td>
      <td className="px-3 py-3">
        <DecimalInput
          value={draft.kgLliurats}
          onChange={(value) => setField("kgLliurats", value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
        />
        {fieldErrors.kgLliurats && <p className="mt-1 text-xs text-red-600">{fieldErrors.kgLliurats}</p>}
      </td>
      <td className="px-3 py-3 text-center align-top">
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || isSaving}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            isDirty && !isSaving ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          {isSaving ? "Guardant..." : "Guardar"}
        </button>
        {generalError && <p className="mt-1 max-w-[140px] text-xs text-red-600">{generalError}</p>}
      </td>
    </tr>
  );
}

function PackagingCard({
  line,
  onSave,
}: {
  line: FilaPanellEmpaquetatApi;
  onSave: (comandaId: number, liniaId: number, unitatsLliurades: number, kgLliurats: string) => Promise<LliuramentSaveResult>;
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const initialValues: Draft = {
    unitatsLliurades: String(line.unitatsLliurades),
    kgLliurats: line.kgLliurats,
  };

  const { draft, setField, save, isDirty } = useEditableRow(initialValues, async (values) => {
    const unitatsLliurades = Number(values.unitatsLliurades.replace(",", "."));
    const kgLliurats = parseDecimalInput(values.kgLliurats, 3);

    setIsSaving(true);
    setFieldErrors({});
    setGeneralError(null);
    const result = await onSave(line.comandaId, line.liniaId, unitatsLliurades, kgLliurats);
    setIsSaving(false);

    if (!result.success) {
      setFieldErrors(result.fieldErrors);
      setGeneralError(result.generalError);
    }
  });

  return (
    <DataCard>
      <p className="font-semibold text-gray-900">{line.producte}</p>
      <p className="text-sm text-gray-500">{line.client ?? "—"}</p>

      <div className="mt-3">
        <DataCardGrid>
          <DataCardField label="Data d'expedició">
            {line.dataExpedicio ? formatData(line.dataExpedicio, false) : "—"}
          </DataCardField>
          <DataCardField label="Data de lliurament">
            {line.dataLliurament ? formatData(line.dataLliurament, false) : "—"}
          </DataCardField>
          <DataCardField label="Transportista">{line.transportista ?? "—"}</DataCardField>
          <DataCardField label="Unitats demanades">{line.unitatsDemanades}</DataCardField>
          <DataCardField label="Kilos demanats">{formatDecimal(line.kgDemanats, 3)}</DataCardField>
        </DataCardGrid>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Unitats lliurades</span>
          <input
            type="number"
            step="1"
            value={draft.unitatsLliurades}
            onChange={(event) => setField("unitatsLliurades", event.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
          {fieldErrors.unitatsLliurades && <p className="text-xs text-red-600">{fieldErrors.unitatsLliurades}</p>}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">Kilos lliurats</span>
          <DecimalInput
            value={draft.kgLliurats}
            onChange={(value) => setField("kgLliurats", value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
          {fieldErrors.kgLliurats && <p className="text-xs text-red-600">{fieldErrors.kgLliurats}</p>}
        </label>
      </div>

      <DataCardActions>
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || isSaving}
          className={`w-full rounded-full px-3 py-2 text-sm font-semibold ${
            isDirty && !isSaving ? "bg-ink text-white hover:opacity-90" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          {isSaving ? "Guardant..." : "Guardar"}
        </button>
      </DataCardActions>
      {generalError && <p className="mt-2 text-xs text-red-600">{generalError}</p>}
    </DataCard>
  );
}

export default function PackagingPage() {
  const { data: clients } = useClientTariffs();
  const { data: carriers } = useCarriers();

  const [shippingDateFilter, setShippingDateFilter] = useState("");
  const [carrierFilter, setCarrierFilter] = useState(ALL);
  const [clientFilter, setClientFilter] = useState(ALL);

  // "Data de lliurament" i "Producte" — visibles al mockup però SENSE
  // suport al backend (GET /panells/empaquetat no els accepta com a
  // filtre, confirmat contra panells.ts). Queden com a estat local pur,
  // sense cap lògica de filtratge ni missatge inventat, mateix criteri ja
  // aplicat a Oficina.
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const carrierId = useMemo(
    () => (carrierFilter !== ALL ? carriers.find((item) => item.nom === carrierFilter)?.id : undefined),
    [carrierFilter, carriers],
  );
  const clientId = useMemo(
    () => (clientFilter !== ALL ? clients.find((item) => clientLabel(item) === clientFilter)?.id : undefined),
    [clientFilter, clients],
  );

  const filters = useMemo(
    () => ({
      ...(shippingDateFilter ? { dataExpedicioDes: shippingDateFilter, dataExpedicioFins: shippingDateFilter } : {}),
      ...(carrierId !== undefined ? { transportistaId: carrierId } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
    }),
    [shippingDateFilter, carrierId, clientId],
  );

  const { data, totals, isLoading, error, refetch, saveLliurament } = usePanellEmpaquetat(filters);

  function clearFilters() {
    setShippingDateFilter("");
    setCarrierFilter(ALL);
    setClientFilter(ALL);
    setDeliveryDateFilter("");
    setProductSearch("");
  }

  async function handleSave(comandaId: number, liniaId: number, unitatsLliurades: number, kgLliurats: string) {
    return saveLliurament(comandaId, liniaId, { unitatsLliurades, kgLliurats });
  }

  return (
    <div>
      <PageHeader
        title="Panell d'Empaquetat"
        subtitle="Línies de comanda per a la planificació d'empaquetat."
        right={
          <div className="flex gap-3">
            <StatCard
              label="TOTAL UNITATS VISIBLES"
              value={totals?.unitatsDemanades ?? 0}
            />
            <StatCard
              label="TOTAL LÍNIES"
              value={totals?.linies ?? 0}
              secondary={`${totals?.liniesConfirmades ?? 0} confirmades · ${totals?.liniesPendents ?? 0} pendents`}
            />
          </div>
        }
      />

      <FilterBar>
        <DateInput label="Data d'expedició" value={shippingDateFilter} onChange={setShippingDateFilter} />
        <DateInput label="Data de lliurament" value={deliveryDateFilter} onChange={setDeliveryDateFilter} />
        <SelectFilter
          label="Transportista"
          options={[ALL, ...carriers.map((item) => item.nom)]}
          value={carrierFilter}
          onChange={setCarrierFilter}
        />
        <SearchInput label="Producte" value={productSearch} onChange={setProductSearch} />
        <SelectFilter
          label="Client"
          options={[ALL, ...clients.map((item) => clientLabel(item))]}
          value={clientFilter}
          onChange={setClientFilter}
        />
        <ClearFiltersButton onClick={clearFilters} />
      </FilterBar>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;han pogut carregar les línies: {error.message}</p>
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
            {data.map((line) => (
              <PackagingCard key={line.liniaId} line={line} onSave={handleSave} />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white xl:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="w-[10%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Data d&apos;expedició
                  </th>
                  <th className="w-[9%] px-3 py-2 text-left font-medium text-gray-500 break-words">
                    Data de lliurament
                  </th>
                  <th className="w-[12%] px-3 py-2 text-left font-medium text-gray-500 break-words">Transportista</th>
                  <th className="w-[12%] px-3 py-2 text-left font-medium text-gray-500 break-words">Producte</th>
                  <th className="w-[10%] px-3 py-2 text-left font-medium text-gray-500 break-words">Client</th>
                  <th className="w-[10%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Unitats demanades
                  </th>
                  <th className="w-[9%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Unitats lliurades
                  </th>
                  <th className="w-[9%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Kilos demanats
                  </th>
                  <th className="w-[9%] px-3 py-2 text-right font-medium text-gray-500 break-words">
                    Kilos lliurats
                  </th>
                  <th className="w-[10%] px-3 py-2 text-center font-medium text-gray-500 break-words">Guardar</th>
                </tr>
              </thead>
              <tbody>
                {data.map((line) => (
                  <PackagingRow key={line.liniaId} line={line} onSave={handleSave} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
