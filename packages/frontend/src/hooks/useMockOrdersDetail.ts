"use client";

import { useEffect, useState } from "react";
import type { ComandaDetallApi } from "@/lib/api";
import { getMockOrders } from "@/mocks/orders";

/**
 * Shim temporal SOLO para `app/office/*` (Panell Oficina) — esa pantalla es
 * de sólo lectura (docs/contrato-api.md §4.6) y su conexión real es
 * `GET /panells/oficina` (`FilaPanellOficinaApi`), no `/comandes`. Quedó
 * fuera del alcance de esta sesión (conexión de Comandes), que cambió
 * `useOrders()` a `ComandaResumApi[]` — este hook preserva el
 * comportamiento mock exacto que ya tenía `app/office/*` para no romper su
 * build. BORRAR cuando se conecte Panell Oficina a su endpoint real.
 */
export function useMockOrdersDetail() {
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

  return { data, isLoading, error };
}
