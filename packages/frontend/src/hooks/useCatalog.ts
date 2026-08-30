"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Paginacio, type ProducteApi, type RespostaPaginada } from "@/lib/api";

export type ProductFormValues = {
  codi: string | null;
  descripcio: string;
  descripcioVenda: string | null;
  categoriaId: number | null;
  agrupacioProduccio: string | null;
  format: ProducteApi["format"];
  envasat: ProducteApi["envasat"];
  pesKg: string | null;
  preuVenda: string | null;
  actiu: boolean;
};

export type CatalogFilters = { cerca?: string };

/**
 * `mida` per defecte es manté a 200 (no 20): `useCatalog()` es fa servir
 * com a taula de consulta completa en 7 llocs fora de la seva pròpia
 * pantalla (workshop, packaging, production, orders/new, orders/[id],
 * PigYieldFormModal, rates/page.tsx — aquest últim el necessita per
 * resoldre categoria/format de CADA producte de la matriu de tarifes, no
 * només els 20 de la pàgina actual). Sols `app/catalog/page.tsx` passa
 * `mida: 20` explícit per paginar de veritat la seva pròpia llista.
 */
export type UseCatalogParams = { mida?: number };

type UseCatalogResult = {
  data: ProducteApi[];
  paginacio: Paginacio | null;
  pagina: number;
  setPagina: (pagina: number) => void;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  createProduct: (values: ProductFormValues) => Promise<void>;
  editProduct: (id: number, values: ProductFormValues) => Promise<void>;
};

const MIDA_PER_DEFECTE = 200;

export function useCatalog(filters: CatalogFilters = {}, params: UseCatalogParams = {}): UseCatalogResult {
  const { mida = MIDA_PER_DEFECTE } = params;
  const [data, setData] = useState<ProducteApi[]>([]);
  const [paginacio, setPaginacio] = useState<Paginacio | null>(null);
  const [pagina, setPagina] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const filtersKey = JSON.stringify(filters);

  // Un canvi de cerca torna a la pàgina 1 — evita quedar-se en una pàgina
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
      .get<RespostaPaginada<ProducteApi>>("/productes", { mida, pagina, ...filters })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, pagina, mida, filtersKey]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  // El backend espera categoriaId pla al escriure, no l'objecte categoria
  // que sí retorna el GET (productes.ts) — es tradueix acá, no al formulari.
  function aCosApi(values: ProductFormValues) {
    return {
      codi: values.codi,
      descripcio: values.descripcio,
      descripcioVenda: values.descripcioVenda,
      categoriaId: values.categoriaId,
      agrupacioProduccio: values.agrupacioProduccio,
      format: values.format,
      envasat: values.envasat,
      pesKg: values.pesKg,
      preuVenda: values.preuVenda,
      actiu: values.actiu,
    };
  }

  // Sin edición optimista, mismo criterio que useCategories.ts: refetch tras mutación.
  const createProduct = useCallback(
    async (values: ProductFormValues) => {
      await api.post<ProducteApi>("/productes", aCosApi(values));
      refetch();
    },
    [refetch],
  );

  const editProduct = useCallback(
    async (id: number, values: ProductFormValues) => {
      await api.patch<ProducteApi>(`/productes/${id}`, aCosApi(values));
      refetch();
    },
    [refetch],
  );

  return { data, paginacio, pagina, setPagina, isLoading, error, refetch, createProduct, editProduct };
}
