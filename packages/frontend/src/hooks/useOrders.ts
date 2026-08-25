"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComandaDetallApi } from "@/lib/api";
import { addMockOrder, getMockOrders, nextMockOrderNumber, updateMockOrder } from "@/mocks/orders";

type OrderFormValues = Omit<ComandaDetallApi, "id" | "num">;

type UseOrdersResult = {
  data: ComandaDetallApi[];
  isLoading: boolean;
  error: Error | null;
  createOrder: (values: OrderFormValues) => void;
  editOrder: (num: string, values: ComandaDetallApi) => void;
  markIncidence: (num: string) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockOrders()
// por api.get<ComandaResumApi[]>("/comandes") sin tocar la forma del hook.
export function useOrders(): UseOrdersResult {
  const [data, setData] = useState<ComandaDetallApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockOrders()
      .then((orders) => {
        if (!cancelled) setData(orders);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // TODO: sustituir por mutation real (POST /comandes) cuando exista backend.
  const createOrder = useCallback((values: OrderFormValues) => {
    const order = { ...values, num: nextMockOrderNumber() };
    console.log("create order", order);
    addMockOrder(order).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /comandes/:id) cuando exista backend.
  const editOrder = useCallback((num: string, values: ComandaDetallApi) => {
    console.log("edit order", num, values);
    updateMockOrder(num, values).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /comandes/:id, estat: "amb_incidencia") cuando exista backend.
  const markIncidence = useCallback(
    (num: string) => {
      const order = data.find((item) => item.num === num);
      if (!order) return;
      console.log("mark incidence", num);
      updateMockOrder(num, { ...order, estat: "amb_incidencia" }).then(setData);
    },
    [data],
  );

  return { data, isLoading, error, createOrder, editOrder, markIncidence };
}
