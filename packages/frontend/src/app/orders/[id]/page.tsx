"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCarriers } from "@/hooks/useCarriers";
import { useCatalog } from "@/hooks/useCatalog";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { extractComandaErrorMessage, type OrderLineChanges, useOrders } from "@/hooks/useOrders";
import { useOrigensComanda } from "@/hooks/useOrigensComanda";
import { useRates } from "@/hooks/useRates";
import { api, ApiError, type ComandaDetallApi } from "@/lib/api";
import { OrderForm, type OrderFormHandle } from "../OrderForm";

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { editOrder, deleteLine, markIncidence, addLine, editLine } = useOrders();
  const { data: clients } = useClientTariffs();
  const { tariffColumns } = useRates();
  const { data: carriers } = useCarriers();
  const { data: products } = useCatalog();
  const { data: origins } = useOrigensComanda();
  const formRef = useRef<OrderFormHandle>(null);

  const [order, setOrder] = useState<ComandaDetallApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lineWarning, setLineWarning] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasDateErrors, setHasDateErrors] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [incidenceDetall, setIncidenceDetall] = useState("");
  const [incidenceError, setIncidenceError] = useState<string | null>(null);
  const [isMarkingIncidence, setIsMarkingIncidence] = useState(false);

  // Se pide por id directo (GET /comandes/:id), no se busca en una lista ya
  // cargada — mismo criterio que Catàleg. `congelada` viene ya resuelto acá
  // (ComandaDetallApi.congelada/congelatA), así que la pantalla puede
  // deshabilitar la edición desde el arranque, sin esperar a un 409.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    api
      .get<ComandaDetallApi>(`/comandes/${params.id}`)
      .then((resposta) => {
        if (!cancelled) setOrder(resposta);
      })
      .catch((caught) => {
        if (!cancelled) {
          setLoadError(
            caught instanceof ApiError ? caught : new ApiError("ERROR_XARXA", "Error desconegut.", null),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id, reloadToken]);

  async function handleSave(values: Parameters<typeof editOrder>[1], lineChanges: OrderLineChanges) {
    if (!order) return;
    setSaveError(null);
    setLineWarning(null);
    setIsSaving(true);

    let headerFailed = false;
    try {
      await editOrder(order.id, values);
    } catch (caught) {
      headerFailed = true;
      setSaveError(extractComandaErrorMessage(caught, "No s'ha pogut desar la comanda."));
    }

    // Capa 30 — una llamada por línia nova/editada (el backend no ofereix
    // un endpoint batch). Cap error interromp les altres: es guarden totes
    // les que es puguin i s'avisa amb el detall de les que han fallat.
    // Capa 34 — el cas delicat: editar NOMÉS la capçalera (headerFailed
    // amunt) també pot xocar amb una línia existent que ni tan sols
    // s'estigui tocant en aquest request (ver comentari a comandes.ts,
    // PATCH /comandes/:id) — extractComandaErrorMessage ja inclou quina
    // línia és, encara que aquí no hi hagi cap `lineChanges` que la referenci.
    const lineErrors: string[] = [];
    for (const novaLinia of lineChanges.novaLinies) {
      try {
        await addLine(order.id, novaLinia);
      } catch (caught) {
        lineErrors.push(extractComandaErrorMessage(caught, "No s'ha pogut afegir una línia."));
      }
    }
    for (const { liniaId, patch } of lineChanges.liniesEditades) {
      try {
        await editLine(order.id, liniaId, patch);
      } catch (caught) {
        lineErrors.push(extractComandaErrorMessage(caught, "No s'ha pogut editar una línia."));
      }
    }
    if (lineErrors.length > 0) setLineWarning(lineErrors.join(" "));

    setIsSaving(false);
    if (!headerFailed && lineErrors.length === 0) {
      router.push("/orders");
    } else {
      setReloadToken((token) => token + 1);
    }
  }

  async function handleDeleteLine(liniaId: number) {
    if (!order) return;
    await deleteLine(order.id, liniaId);
    setReloadToken((token) => token + 1);
  }

  async function handleConfirmIncidence() {
    if (!order) return;
    setIsMarkingIncidence(true);
    setIncidenceError(null);
    try {
      await markIncidence(order.id, incidenceDetall.trim());
      setConfirmOpen(false);
      setIncidenceDetall("");
      setReloadToken((token) => token + 1);
    } catch (caught) {
      setIncidenceError(caught instanceof ApiError ? caught.message : "No s'ha pogut marcar la incidència.");
    } finally {
      setIsMarkingIncidence(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/orders"
            className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Tornar
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">Comanda {order?.num ?? params.id}</h1>
          {order?.congelada && <Badge variant="neutral">Congelada</Badge>}
        </div>
        {order && (
          <div className="flex items-center gap-3">
            {order.estat !== "amb_incidencia" && !order.congelada && (
              <button
                type="button"
                onClick={() => {
                  setIncidenceError(null);
                  setIncidenceDetall("");
                  setConfirmOpen(true);
                }}
                className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Marcar com a incidència
              </button>
            )}
            <button
              type="button"
              onClick={() => formRef.current?.submit()}
              disabled={isSaving || order.congelada || hasDateErrors}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Desant..." : "Desar"}
            </button>
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {loadError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;ha pogut carregar la comanda: {loadError.message}</p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {saveError && <p className="mb-4 text-sm text-red-600">{saveError}</p>}
      {lineWarning && <p className="mb-4 text-sm text-amber-700">{lineWarning}</p>}

      {order && (
        <OrderForm
          ref={formRef}
          mode="edit"
          initialData={order}
          isFrozen={order.congelada}
          clients={clients}
          tariffs={tariffColumns}
          carriers={carriers}
          products={products}
          origins={origins}
          onSave={handleSave}
          onDeleteLine={handleDeleteLine}
          onDateErrorsChange={setHasDateErrors}
        />
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Marcar com a incidència"
        message={`Vols marcar la comanda ${order?.num ?? ""} com a incidència?`}
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
          setConfirmOpen(false);
          setIncidenceError(null);
          setIncidenceDetall("");
        }}
      />
    </div>
  );
}
