"use client";

// Hook aislado para el panel d'empaquetat, mismo criterio que
// hooks/useObradorPanell.ts: el contrato de datos todavía está en discusión
// con el backend, así que ningún componente de UI debe leer mocks/orders.ts
// directamente para este panel, todo pasa por acá.
//
// `PackagingLine` no lleva el sufijo `Api` por el mismo motivo que
// `ObradorLine`: es una vista aplanada derivada en el cliente a partir de
// ComandaDetallApi, no un contrato de backend confirmado. Desde la capa 20
// del contrato, la línia y la cabecera ya traen embebido lo que antes había
// que cruzar a mano contra catàleg/clients/transportistes.
//
// La escritura (saveLineDelivery) reutiliza updateMockOrder, la misma
// mutación que ya usa Comandes para editar una comanda completa — acá se
// construye la comanda actualizada con la línea parcheada y se delega en
// esa función, sin duplicar lógica de escritura.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComandaDetallApi } from "@/lib/api";
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

function flattenOrders(orders: ComandaDetallApi[]): PackagingLine[] {
  return orders.flatMap((order) =>
    order.linies
      .filter((line) => !line.esborrat)
      .map((line) => ({
        id: String(line.id),
        orderNumber: order.num,
        productDescription: line.producte?.descripcio ?? "—",
        category: line.categoria ?? "—",
        format: line.format ?? "—",
        packaging: line.envasat ?? "—",
        clientName: order.client?.nom ?? "—",
        carrierName: order.transportista?.nom ?? "—",
        shippingDate: order.dataExpedicio,
        deliveryDate: order.dataLliurament,
        orderedUnits: line.unitatsDemanades,
        orderedWeightKg: Number(line.kgDemanats),
        deliveredUnits: line.unitatsLliurades,
        deliveredWeightKg: Number(line.kgLliurats),
      })),
  );
}

export function usePackagingPanell(): UsePackagingPanellResult {
  const [orders, setOrders] = useState<ComandaDetallApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockOrders()
      .then((fetchedOrders) => {
        if (!cancelled) setOrders(fetchedOrders);
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

  const data = useMemo(() => flattenOrders(orders), [orders]);

  const saveLineDelivery = useCallback(
    (orderNumber: string, lineId: string, deliveredUnits: number, deliveredWeightKg: number) => {
      const order = orders.find((item) => item.num === orderNumber);
      if (!order) return;
      const updatedOrder: ComandaDetallApi = {
        ...order,
        linies: order.linies.map((line) =>
          line.id === Number(lineId)
            ? {
                ...line,
                unitatsLliurades: deliveredUnits,
                kgLliurats: deliveredWeightKg.toFixed(3),
                confirmatA: new Date().toISOString(),
              }
            : line,
        ),
      };
      updateMockOrder(orderNumber, updatedOrder).then(setOrders);
    },
    [orders],
  );

  return { data, isLoading, error, saveLineDelivery };
}
