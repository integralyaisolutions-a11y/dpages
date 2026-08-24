"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCatalog } from "@/hooks/useCatalog";
import type { ProductApi } from "@/lib/api";
import { ProductForm } from "../ProductForm";

export default function NewProductPage() {
  const router = useRouter();
  const { createProduct } = useCatalog();

  function handleSave(values: ProductApi) {
    createProduct(values);
    router.push("/catalog");
  }

  return (
    <div>
      <PageHeader title="Nou producte" />
      <ProductForm onSave={handleSave} onCancel={() => router.push("/catalog")} />
    </div>
  );
}
