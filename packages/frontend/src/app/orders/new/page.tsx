"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCarriers } from "@/hooks/useCarriers";
import { useCatalog } from "@/hooks/useCatalog";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { extractComandaErrorMessage, useOrders } from "@/hooks/useOrders";
import { useRates } from "@/hooks/useRates";
import type { ComandaDetallApi } from "@/lib/api";
import { OrderForm, type OrderFormHandle } from "../OrderForm";

export default function NewOrderPage() {
  const router = useRouter();
  const { createOrder } = useOrders();
  const { data: clients } = useClientTariffs();
  const { tariffColumns } = useRates();
  const { data: carriers } = useCarriers();
  const { data: products } = useCatalog();
  const formRef = useRef<OrderFormHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<ComandaDetallApi | null>(null);
  const [patchWarning, setPatchWarning] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasDateErrors, setHasDateErrors] = useState(false);

  async function handleSave(values: Parameters<typeof createOrder>[0]) {
    setError(null);
    setPatchWarning(null);
    setIsSaving(true);
    try {
      const { order, patchError } = await createOrder(values);
      setCreatedOrder(order);
      if (patchError) {
        setPatchWarning(
          `La comanda ${order.num} s'ha creat correctament, però alguns camps de capçalera no s'han pogut desar: ${extractComandaErrorMessage(patchError, patchError.message)}. Podeu revisar-los i tornar-los a desar des de la comanda.`,
        );
      } else {
        router.push(`/orders/${order.id}`);
      }
    } catch (caught) {
      setError(extractComandaErrorMessage(caught, "No s'ha pogut crear la comanda."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Nova comanda"
        right={
          <button
            type="button"
            onClick={() => formRef.current?.submit()}
            disabled={isSaving || createdOrder !== null || hasDateErrors}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Desant..." : "Desar"}
          </button>
        }
      />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {patchWarning && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">{patchWarning}</p>
          {createdOrder && (
            <Link
              href={`/orders/${createdOrder.id}`}
              className="shrink-0 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Anar a la comanda
            </Link>
          )}
        </div>
      )}

      <OrderForm
        ref={formRef}
        mode="create"
        clients={clients}
        tariffs={tariffColumns}
        carriers={carriers}
        products={products}
        onSave={handleSave}
        onDateErrorsChange={setHasDateErrors}
      />
    </div>
  );
}
