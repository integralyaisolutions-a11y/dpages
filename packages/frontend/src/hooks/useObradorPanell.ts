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
// vista aplanada derivada en el cliente a partir de ComandaDetallApi
// mientras ese contrato no cierra. Ya no hace falta cruzar por separado
// contra el catàleg/clients: desde la capa 20 del contrato, cada línia de
// comanda (ComandaLiniaApi) ya trae categoria/format/envasat resueltos, y
// la cabecera ya trae el client embebido — igual que expone `GET
// /panells/obrador` de verdad (contrato §4.7).

import { useEffect, useState } from "react";
import { mockRequest } from "@/lib/mockClient";
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

    getMockOrders()
      .then((orders) => {
        const lines: ObradorLine[] = orders.flatMap((order) =>
          order.linies
            .filter((line) => !line.esborrat)
            .map((line) => ({
              id: String(line.id),
              productDescription: line.producte?.descripcio ?? "—",
              packaging: line.envasat ?? "—",
              format: line.format ?? "—",
              clientName: order.client?.nom ?? "—",
              productionDate: line.dataProduccio,
              units: line.unitatsDemanades,
              weightKg: Number(line.kgDemanats),
              productionNotes: line.obsProduccio ?? "",
            })),
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
