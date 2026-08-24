"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useCarriers } from "@/hooks/useCarriers";
import { useCatalog } from "@/hooks/useCatalog";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useOrders } from "@/hooks/useOrders";
import { useRates } from "@/hooks/useRates";
import type { OrderApi } from "@/lib/api";
import { OrderForm, type OrderFormHandle } from "../OrderForm";

export default function NewOrderPage() {
  const router = useRouter();
  const { createOrder } = useOrders();
  const { data: clients } = useClientTariffs();
  const { tariffColumns } = useRates();
  const { data: carriers } = useCarriers();
  const { data: products } = useCatalog();
  const formRef = useRef<OrderFormHandle>(null);

  function handleSave(values: Omit<OrderApi, "number">) {
    createOrder(values);
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
          <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">Nova comanda</h1>
        </div>
        <button
          type="button"
          onClick={() => formRef.current?.submit()}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Desar
        </button>
      </div>

      <OrderForm
        ref={formRef}
        mode="create"
        clients={clients}
        tariffs={tariffColumns}
        carriers={carriers}
        products={products}
        onSave={handleSave}
      />
    </div>
  );
}
