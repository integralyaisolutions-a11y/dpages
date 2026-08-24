"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrderApi } from "@/lib/api";
import { addMockOrder, getMockOrders, nextMockOrderNumber, updateMockOrder } from "@/mocks/orders";

type UseOrdersResult = {
  data: OrderApi[];
  isLoading: boolean;
  error: Error | null;
  createOrder: (values: Omit<OrderApi, "number">) => void;
  editOrder: (number: string, values: OrderApi) => void;
  markIncidence: (number: string) => void;
};

// TODO: cuando cierre el contrato con el backend, reemplazar getMockOrders()
// por api.get<OrderApi[]>("/orders") sin tocar la forma del hook.
export function useOrders(): UseOrdersResult {
  const [data, setData] = useState<OrderApi[]>([]);
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

  // TODO: sustituir por mutation real (POST /orders) cuando exista backend.
  const createOrder = useCallback((values: Omit<OrderApi, "number">) => {
    const order: OrderApi = { ...values, number: nextMockOrderNumber() };
    console.log("create order", order);
    addMockOrder(order).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /orders/:number) cuando exista backend.
  const editOrder = useCallback((number: string, values: OrderApi) => {
    console.log("edit order", number, values);
    updateMockOrder(number, values).then(setData);
  }, []);

  // TODO: sustituir por mutation real (PATCH /orders/:number/incidence) cuando exista backend.
  const markIncidence = useCallback(
    (number: string) => {
      const order = data.find((item) => item.number === number);
      if (!order) return;
      console.log("mark incidence", number);
      updateMockOrder(number, { ...order, status: "Incidència" }).then(setData);
    },
    [data],
  );

  return { data, isLoading, error, createOrder, editOrder, markIncidence };
}
