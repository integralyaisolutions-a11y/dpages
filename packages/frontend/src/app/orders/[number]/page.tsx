"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCarriers } from "@/hooks/useCarriers";
import { useCatalog } from "@/hooks/useCatalog";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useOrders } from "@/hooks/useOrders";
import { useRates } from "@/hooks/useRates";
import type { ComandaDetallApi } from "@/lib/api";
import { OrderForm, type OrderFormHandle } from "../OrderForm";

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ number: string }>();
  const { data: orders, isLoading, error, editOrder, markIncidence } = useOrders();
  const { data: clients } = useClientTariffs();
  const { tariffColumns } = useRates();
  const { data: carriers } = useCarriers();
  const { data: products } = useCatalog();
  const formRef = useRef<OrderFormHandle>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const order = orders.find((item) => item.num === params.number);

  function handleSave(values: Omit<ComandaDetallApi, "id" | "num">) {
    if (!order) return;
    editOrder(params.number, { id: order.id, num: params.number, ...values });
    router.push("/orders");
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
          <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">Comanda {params.number}</h1>
        </div>
        <div className="flex items-center gap-3">
          {order && order.estat !== "amb_incidencia" && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Marcar com a incidència
            </button>
          )}
          <button
            type="button"
            onClick={() => formRef.current?.submit()}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Desar
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;ha pogut carregar la comanda.</p>}
      {!isLoading && !error && !order && (
        <p className="text-sm text-gray-500">No s&apos;ha trobat la comanda {params.number}.</p>
      )}

      {order && (
        <OrderForm
          ref={formRef}
          mode="edit"
          initialData={order}
          clients={clients}
          tariffs={tariffColumns}
          carriers={carriers}
          products={products}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Marcar com a incidència"
        message={`Vols marcar la comanda ${params.number} com a incidència?`}
        confirmLabel="Marcar"
        cancelLabel="Cancel·lar"
        onConfirm={() => {
          markIncidence(params.number);
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
