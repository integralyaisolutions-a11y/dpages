'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

/**
 * Capa 44 — `GET /rols/moduls-valids` expone la MISMA constante que valida
 * `POST`/`PATCH /rols` en el backend (rols.ts), reemplazando el
 * `MODULS_VALIDS` que antes vivía hardcodeado y duplicado a mano en
 * `lib/roles.ts` (con el riesgo real de desincronizarse en silencio — ya
 * pasó una vez con "transportistes"). Sin guard, cualquier usuario
 * autenticado puede leerlo.
 */
type UseModulsValidsResult = {
  data: string[];
  isLoading: boolean;
  error: ApiError | null;
};

export function useModulsValids(): UseModulsValidsResult {
  const [data, setData] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Fetch a un sistema extern (API): el reset síncron d'isLoading/error
    // just abans de cridar-lo és el patró de React per a data fetching en
    // efectes, no un valor derivable durant el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    api
      .get<{ dades: string[] }>('/rols/moduls-valids')
      .then((resposta) => {
        if (!cancelled) setData(resposta.dades);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError
              ? caught
              : new ApiError('ERROR_XARXA', 'Error desconegut.', null),
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
