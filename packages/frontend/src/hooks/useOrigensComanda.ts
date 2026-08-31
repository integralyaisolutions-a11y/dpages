"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type OrigenComandaApi, type RespostaPaginada } from "@/lib/api";

// Volum real: 5 files fixes (woocommerce/manual/whatsapp/telefon/correu,
// capa 43) — molt per sota del màxim de pàgina (200), sense cap pantalla
// de gestió pròpia que ho requereixi encara. Sense create/edit acá: aquest
// hook només alimenta el desplegable d'Origen a OrderForm.tsx.
const MIDA_LLISTAT = 50;

type UseOrigensComandaResult = {
  data: OrigenComandaApi[];
  isLoading: boolean;
  error: ApiError | null;
};

export function useOrigensComanda(): UseOrigensComandaResult {
  const [data, setData] = useState<OrigenComandaApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<RespostaPaginada<OrigenComandaApi>>("/origens-comanda", { mida: MIDA_LLISTAT })
      .then((resposta) => {
        if (!cancelled) setData(resposta.dades);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught : new ApiError("ERROR_XARXA", "Error desconegut.", null),
          );
        }
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
