"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type ComandaCreacioApi,
  type ComandaDetallApi,
  type ComandaResumApi,
  type LiniaCreacioApi,
  type LiniaEdicioApi,
  type Paginacio,
  type RespostaPaginada,
} from "@/lib/api";

export type OrderListFilters = {
  estat?: string;
  dataDes?: string;
  dataFins?: string;
  dataProduccioDes?: string;
  dataProduccioFins?: string;
  dataLliuramentDes?: string;
  dataLliuramentFins?: string;
  cerca?: string;
};

export type OrderFormValues = {
  clientId: number | null;
  /**
   * Capa 32 — `POST /comandes` acepta `tarifaId` directo (createOrder, más
   * abajo). En edición viaja igual en el PATCH.
   */
  tarifaId: number | null;
  transportistaId: number | null;
  dataProduccio: string | null;
  dataExpedicio: string | null;
  dataLliurament: string | null;
  bultos: number | null;
  obsProduccio: string | null;
  obsLliurament: string | null;
  poblacioDesti: string | null;
  adrecaLliurament: string | null;
  /**
   * Capa 31 — `PATCH /comandes/:id` acepta `estat`, con transición libre
   * entre `oberta`/`en_proces`/`tancada`. El único camino hacia
   * `amb_incidencia` es `markIncidence` (más abajo, exige `detall`) — este
   * valor nunca se manda como `"amb_incidencia"` desde `editOrder` (ver
   * OrderForm.tsx: el selector de capçalera no ofrece esa opción).
   */
  estat: string;
  /** Sólo se usa en creación — el POST se arma con esto. */
  linies: LiniaCreacioApi[];
};

/** Línies noves (POST) i línies editades (PATCH) d'una comanda ja creada — capa 30. Buit en mode "create" (les línies viatgen dins ComandaCreacioApi). */
export type OrderLineChanges = {
  novaLinies: LiniaCreacioApi[];
  liniesEditades: { liniaId: number; patch: LiniaEdicioApi }[];
};

/**
 * Capa 34 — el 400 de coherència de dates (POST /comandes, PATCH
 * /comandes/:id, i els dos endpoints de línia) ve amb `missatge` genèric
 * al nivell superior ("Les dates no són coherents") i el detall REAL
 * (quina regla, i per a les línies, quina línia — "línia núm. 38008: ...")
 * dins `detalls[0].missatge`. Sempre és NOMÉS el primer detall (el
 * backend no acumula els 6); el seu `camp` és `dataLliurament`/
 * `dataExpedicio` (capçalera) o el sintètic `linies[].dataProduccio` —
 * cap dels dos coincideix amb el patró de mapeig per camp que fem servir
 * a altres pantalles (ex. ClientFormModal), i el de línia ni tan sols
 * apunta a cap input real. Per això NO s'intenta mapejar: es mostra el
 * missatge sencer (genèric + detall) com a error de formulari.
 */
function esErrorCoherenciaDates(caught: ApiError): boolean {
  const camp = caught.detalls?.[0]?.camp;
  return (
    caught.codi === "VALIDACIO" &&
    (camp === "dataLliurament" || camp === "dataExpedicio" || (camp?.startsWith("linies[") ?? false))
  );
}

export function extractComandaErrorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError) {
    if (esErrorCoherenciaDates(caught)) {
      return `${caught.message}: ${caught.detalls![0]!.missatge}`;
    }
    return caught.message;
  }
  return fallback;
}

type UseOrdersResult = {
  data: ComandaResumApi[];
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createOrder: (values: OrderFormValues) => Promise<{ order: ComandaDetallApi; patchError: ApiError | null }>;
  editOrder: (id: number, values: OrderFormValues) => Promise<void>;
  deleteLine: (comandaId: number, liniaId: number) => Promise<void>;
  /** Capa 31 — PATCH { estat: "amb_incidencia", detall }. `detall` és obligatori (400 si arriba buit). */
  markIncidence: (comandaId: number, detall: string) => Promise<ComandaDetallApi>;
  /** Capa 30 — POST /comandes/:comandaId/linies. */
  addLine: (comandaId: number, linia: LiniaCreacioApi) => Promise<ComandaDetallApi>;
  /** Capa 30 — PATCH /comandes/:comandaId/linies/:liniaId. */
  editLine: (comandaId: number, liniaId: number, patch: LiniaEdicioApi) => Promise<ComandaDetallApi>;
};

// Paginació real (20/pàgina) — a diferència de catálogos/categorías/
// tarifas, el volumen de comandas crece cada semana, así que ya se
// filtraba server-side (los filtros de la pantalla tienen soporte real en
// GET /comandes); ahora también pagina de verdad en vez de traer 200.
const MIDA_PAGINA = 20;

export function useOrders(filters: OrderListFilters = {}): UseOrdersResult {
  const [data, setData] = useState<ComandaResumApi[]>([]);
  const [paginacio, setPaginacio] = useState<Paginacio | null>(null);
  const [pagina, setPagina] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  // Un canvi de filtre torna a la pàgina 1 — evita quedar-se en una pàgina
  // que ja no existeix pel nou resultat filtrat.
  useEffect(() => {
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<RespostaPaginada<ComandaResumApi>>("/comandes", { mida: MIDA_PAGINA, pagina, ...filters })
      .then((resposta) => {
        if (!cancelled) {
          setData(resposta.dades);
          setPaginacio(resposta.paginacio);
        }
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
    // filtersKey serialitza `filters` (objecte pla de primitives) — evita
    // refer la petició en cada render per canvi d'identitat de l'objecte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, pagina, filtersKey]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  // Alta real (POST) + PATCH encadenado para los campos que POST no acepta
  // (bultos/poblacioDesti/adrecaLliurament/obsProduccio/dataProduccio/
  // dataExpedicio — fuera de ComandaCreacioApi, contrato §4.5). tarifaId
  // SÍ viaja directo en el POST (capa 32), ya no en este PATCH. Si el POST
  // tiene éxito pero el PATCH falla, la comanda YA existe — nunca se
  // reintenta el POST (evitaría duplicados); se devuelve la comanda creada
  // más el error del PATCH para que la pantalla avise qué campos no se
  // guardaron.
  const createOrder = useCallback(
    async (values: OrderFormValues) => {
      const cos: ComandaCreacioApi = { origen: "manual", linies: values.linies };
      if (values.clientId !== null) cos.clientId = values.clientId;
      if (values.tarifaId !== null) cos.tarifaId = values.tarifaId;
      if (values.dataLliurament !== null) cos.dataLliurament = values.dataLliurament;
      if (values.transportistaId !== null) cos.transportistaId = values.transportistaId;
      if (values.obsLliurament !== null) cos.obsLliurament = values.obsLliurament;

      const creada = await api.post<ComandaDetallApi>("/comandes", cos);

      const patchCos: Record<string, unknown> = {};
      if (values.bultos !== null) patchCos.bultos = values.bultos;
      if (values.poblacioDesti !== null) patchCos.poblacioDesti = values.poblacioDesti;
      if (values.adrecaLliurament !== null) patchCos.adrecaLliurament = values.adrecaLliurament;
      if (values.obsProduccio !== null) patchCos.obsProduccio = values.obsProduccio;
      if (values.dataProduccio !== null) patchCos.dataProduccio = values.dataProduccio;
      if (values.dataExpedicio !== null) patchCos.dataExpedicio = values.dataExpedicio;

      if (Object.keys(patchCos).length === 0) {
        refetch();
        return { order: creada, patchError: null };
      }

      try {
        const actualitzada = await api.patch<ComandaDetallApi>(`/comandes/${creada.id}`, patchCos);
        refetch();
        return { order: actualitzada, patchError: null };
      } catch (caught) {
        refetch();
        return {
          order: creada,
          patchError:
            caught instanceof ApiError ? caught : new ApiError("ERROR_XARXA", "Error desconegut.", null),
        };
      }
    },
    [refetch],
  );

  const editOrder = useCallback(
    async (id: number, values: OrderFormValues) => {
      const cos: Record<string, unknown> = {
        clientId: values.clientId,
        tarifaId: values.tarifaId,
        transportistaId: values.transportistaId,
        dataProduccio: values.dataProduccio,
        dataExpedicio: values.dataExpedicio,
        dataLliurament: values.dataLliurament,
        bultos: values.bultos,
        obsProduccio: values.obsProduccio,
        obsLliurament: values.obsLliurament,
        poblacioDesti: values.poblacioDesti,
        adrecaLliurament: values.adrecaLliurament,
      };
      // Capa 31 — el selector de capçalera (OrderForm.tsx) només ofereix
      // oberta/en_proces/tancada, mai amb_incidencia: si l'estat carregat
      // ja era amb_incidencia i l'usuari no l'ha tocat, NO es reenvia (el
      // backend exigeix `detall` sempre que `estat` sigui amb_incidencia
      // al body, encara que sigui el mateix valor que ja tenia). La única
      // via cap a amb_incidencia és markIncidence, més avall.
      if (values.estat !== "amb_incidencia") {
        cos.estat = values.estat;
      }
      await api.patch<ComandaDetallApi>(`/comandes/${id}`, cos);
      refetch();
    },
    [refetch],
  );

  const deleteLine = useCallback(
    async (comandaId: number, liniaId: number) => {
      await api.delete(`/comandes/${comandaId}/linies/${liniaId}`);
      refetch();
    },
    [refetch],
  );

  // Capa 31 — único camino real hacia amb_incidencia: detall es obligatori
  // al backend (400 si arriba buit), la pantalla ha de pedirlo abans de cridar.
  const markIncidence = useCallback(
    async (comandaId: number, detall: string): Promise<ComandaDetallApi> => {
      const actualitzada = await api.patch<ComandaDetallApi>(`/comandes/${comandaId}`, {
        estat: "amb_incidencia",
        detall,
      });
      refetch();
      return actualitzada;
    },
    [refetch],
  );

  // Capa 30 — agregar una línia a una comanda ja creada.
  const addLine = useCallback(
    async (comandaId: number, linia: LiniaCreacioApi): Promise<ComandaDetallApi> => {
      const actualitzada = await api.post<ComandaDetallApi>(`/comandes/${comandaId}/linies`, linia);
      refetch();
      return actualitzada;
    },
    [refetch],
  );

  // Capa 30 — editar unitatsDemanades/kgDemanats/dataProduccio/obsProduccio
  // d'una línia existent. Mai re-resol preuUnitari (ver LiniaEdicioApi).
  const editLine = useCallback(
    async (comandaId: number, liniaId: number, patch: LiniaEdicioApi): Promise<ComandaDetallApi> => {
      const actualitzada = await api.patch<ComandaDetallApi>(
        `/comandes/${comandaId}/linies/${liniaId}`,
        patch,
      );
      refetch();
      return actualitzada;
    },
    [refetch],
  );

  return {
    data,
    paginacio,
    pagina,
    setPagina,
    isLoading,
    error,
    refetch,
    createOrder,
    editOrder,
    deleteLine,
    markIncidence,
    addLine,
    editLine,
  };
}
