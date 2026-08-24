"use client";

// Hook aislado para el panel d'empaquetat, mismo criterio que
// hooks/useObradorPanell.ts: el contrato de datos todavía está en discusión
// con el backend, así que ningún componente de UI debe leer mocks/orders.ts
// directamente para este panel, todo pasa por acá.
//
// `PackagingLine` no lleva el sufijo `Api` por el mismo motivo que
// `ObradorLine`: es una vista aplanada derivada en el cliente a partir de
// OrderApi/ProductApi/ClientTariffApi/CarrierApi, no un contrato de backend
// confirmado.
//
// La escritura (saveLineDelivery) reutiliza updateMockOrder, la misma
// mutación que ya usa Comandes para editar una comanda completa — acá se
// construye la comanda actualizada con la línea parcheada y se delega en
// esa función, sin duplicar lógica de escritura.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CarrierApi, ClientTariffApi, OrderApi, ProductApi } from "@/lib/api";
import { calculateOrderedWeightKg } from "@/lib/orderCalculations";
import { getMockCatalog } from "@/mocks/catalog";
import { getMockClientTariffs } from "@/mocks/clientTariffs";
import { getMockCarriers } from "@/mocks/carriers";
import { getMockOrders, updateMockOrder } from "@/mocks/orders";

export type PackagingLine = {
  id: string;
  orderNumber: string;
  productDescription: string;
  category: string;
  format: string;
  packaging: string;
  clientName: string;
  carrierName: string;
  shippingDate: string | null;
  deliveryDate: string | null;
  orderedUnits: number;
  orderedWeightKg: number;
  deliveredUnits: number;
  deliveredWeightKg: number;
};

type UsePackagingPanellResult = {
  data: PackagingLine[];
  isLoading: boolean;
  error: Error | null;
  saveLineDelivery: (orderNumber: string, lineId: string, deliveredUnits: number, deliveredWeightKg: number) => void;
};

function flattenOrders(
  orders: OrderApi[],
  products: ProductApi[],
  clients: ClientTariffApi[],
  carriers: CarrierApi[],
): PackagingLine[] {
  return orders.flatMap((order) =>
    order.lines.map((line) => {
      const product = products.find((item) => item.code === line.productCode);
      const client = clients.find((item) => item.code === order.clientCode);
      const carrier = carriers.find((item) => item.code === order.carrierCode);
      const orderedWeight = calculateOrderedWeightKg(line.orderedUnits, product);
      return {
        id: line.id,
        orderNumber: order.number,
        productDescription: product?.description ?? line.productCode,
        category: product?.category ?? "—",
        format: product?.format ?? "—",
        packaging: product?.packaging ?? "—",
        clientName: client?.name ?? order.clientCode,
        carrierName: carrier?.name ?? "—",
        shippingDate: order.shippingDate,
        deliveryDate: order.deliveryDate,
        orderedUnits: line.orderedUnits,
        orderedWeightKg: orderedWeight.isCalculated ? orderedWeight.value : line.orderedWeightKg,
        deliveredUnits: line.deliveredUnits,
        deliveredWeightKg: line.deliveredWeightKg,
      };
    }),
  );
}

export function usePackagingPanell(): UsePackagingPanellResult {
  const [orders, setOrders] = useState<OrderApi[]>([]);
  const [products, setProducts] = useState<ProductApi[]>([]);
  const [clients, setClients] = useState<ClientTariffApi[]>([]);
  const [carriers, setCarriers] = useState<CarrierApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getMockOrders(), getMockCatalog(), getMockClientTariffs(), getMockCarriers()])
      .then(([fetchedOrders, fetchedProducts, fetchedClients, fetchedCarriers]) => {
        if (!cancelled) {
          setOrders(fetchedOrders);
          setProducts(fetchedProducts);
          setClients(fetchedClients);
          setCarriers(fetchedCarriers);
        }
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

  const data = useMemo(
    () => flattenOrders(orders, products, clients, carriers),
    [orders, products, clients, carriers],
  );

  const saveLineDelivery = useCallback(
    (orderNumber: string, lineId: string, deliveredUnits: number, deliveredWeightKg: number) => {
      const order = orders.find((item) => item.number === orderNumber);
      if (!order) return;
      const updatedOrder: OrderApi = {
        ...order,
        lines: order.lines.map((line) =>
          line.id === lineId ? { ...line, deliveredUnits, deliveredWeightKg } : line,
        ),
      };
      updateMockOrder(orderNumber, updatedOrder).then(setOrders);
    },
    [orders],
  );

  return { data, isLoading, error, saveLineDelivery };
}
