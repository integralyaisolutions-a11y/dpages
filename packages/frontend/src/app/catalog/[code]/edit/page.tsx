"use client";

import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCatalog } from "@/hooks/useCatalog";
import type { ProductApi } from "@/lib/api";
import { ProductForm } from "../../ProductForm";

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const { data, isLoading, error, editProduct } = useCatalog();
  const product = data.find((item) => item.code === params.code);

  function handleSave(values: ProductApi) {
    editProduct(params.code, values);
    router.push("/catalog");
  }

  return (
    <div>
      <PageHeader title="Modificació de producte" />
      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;ha pogut carregar el producte.</p>}
      {!isLoading && !error && !product && (
        <p className="text-sm text-gray-500">No s&apos;ha trobat el producte {params.code}.</p>
      )}
      {product && <ProductForm initialData={product} onSave={handleSave} onCancel={() => router.push("/catalog")} />}
    </div>
  );
}
