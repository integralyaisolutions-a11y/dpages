"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCatalog, type ProductFormValues } from "@/hooks/useCatalog";
import { api, ApiError, type ProducteApi } from "@/lib/api";
import { ProductForm } from "../../ProductForm";


export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { editProduct } = useCatalog();
  const [product, setProduct] = useState<ProducteApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Es demana el producte per id directament (GET /productes/:id), no es
  // busca dins d'una llista ja carregada — codi pot ser null (~14 dels 111
  // articles reals no en tenen) i no és un identificador fiable per a rutar.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<ProducteApi>(`/productes/${params.id}`)
      .then((resposta) => {
        if (!cancelled) setProduct(resposta);
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
  }, [params.id, reloadToken]);

  async function handleSave(values: ProductFormValues) {
    if (!product) return;
    await editProduct(product.id, values);
    router.push("/catalog");
  }

  return (
    <div>
      <PageHeader title="Modificació de producte" />
      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">No s&apos;ha pogut carregar el producte: {error.message}</p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Torna-ho a provar
          </button>
        </div>
      )}
      {product && <ProductForm initialData={product} onSave={handleSave} onCancel={() => router.push("/catalog")} />}
    </div>
  );
}
