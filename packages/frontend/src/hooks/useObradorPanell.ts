"use client";

// Hook aislado para el panel de obrador.
//
// El contrato de datos del panel de obrador todavía está en discusión con
// el backend (uno de los cuatro puntos abiertos, junto con
// transportistaDefecte, origen de comanda y tipo de búsqueda — ver
// docs/decisiones-arquitectura.md). El día de mañana el backend podría
// devolver estas líneas ya agrupadas por article (GROUP BY) en vez de
// línies de comanda individuales; por eso ningún componente de UI debe leer
// mocks/orders.ts directamente para este panel, todo pasa por acá, así que
// cuando el contrato cambie el ajuste queda contenido en este archivo y no
// se propaga a los componentes.
//
// Por el mismo motivo, `ObradorLine` no lleva el sufijo `Api`: no es un tipo
// de contrato confirmado con el backend (esos van en lib/api.ts), es una
// vista aplanada derivada en el cliente a partir de OrderApi/ProductApi/
// ClientTariffApi mientras ese contrato no cierra.

import { useEffect, useState } from "react";
import { mockRequest } from "@/lib/mockClient";
import { calculateOrderedWeightKg } from "@/lib/orderCalculations";
import { getMockCatalog } from "@/mocks/catalog";
import { getMockClientTariffs } from "@/mocks/clientTariffs";
import { getMockOrders } from "@/mocks/orders";

export type ObradorLine = {
  id: string;
  productDescription: string;
  packaging: string;
  format: string;
  clientName: string;
  productionDate: string | null;
  units: number;
  weightKg: number;
  productionNotes: string;
};

type UseObradorPanellResult = {
  data: ObradorLine[];
  isLoading: boolean;
  error: Error | null;
};

export function useObradorPanell(): UseObradorPanellResult {
  const [data, setData] = useState<ObradorLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getMockOrders(), getMockCatalog(), getMockClientTariffs()])
      .then(([orders, products, clients]) => {
        const lines: ObradorLine[] = orders.flatMap((order) =>
          order.lines.map((line) => {
            const product = products.find((item) => item.code === line.productCode);
            const client = clients.find((item) => item.code === order.clientCode);
            const orderedWeight = calculateOrderedWeightKg(line.orderedUnits, product);
            return {
              id: line.id,
              productDescription: product?.description ?? line.productCode,
              packaging: product?.packaging ?? "—",
              format: product?.format ?? "—",
              clientName: client?.name ?? order.clientCode,
              productionDate: line.productionDate,
              units: line.orderedUnits,
              weightKg: orderedWeight.isCalculated ? orderedWeight.value : line.orderedWeightKg,
              productionNotes: line.productionNotes,
            };
          }),
        );
        return mockRequest(lines);
      })
      .then((lines) => {
        if (!cancelled) setData(lines);
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

  return { data, isLoading, error };
}
