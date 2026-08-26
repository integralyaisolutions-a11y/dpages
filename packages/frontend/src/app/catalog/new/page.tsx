"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCatalog, type ProductFormValues } from "@/hooks/useCatalog";
import { ProductForm } from "../ProductForm";

export default function NewProductPage() {
  const router = useRouter();
  const { createProduct } = useCatalog();

  async function handleSave(values: ProductFormValues) {
    await createProduct(values);
    router.push("/catalog");
  }

  return (
    <div>
      <PageHeader title="Nou producte" />
      <ProductForm onSave={handleSave} onCancel={() => router.push("/catalog")} />
    </div>
  );
}
