import type { ProducteApi } from './api';

// Compartit entre tots els combobox de producte en mode local — abans
// aquesta regla vivia només a OrderForm.tsx i s'hauria triplicat sense
// canvis al migrar workshop/packaging/production. Mai es crida en mode
// servidor: GET /productes?cerca= fa coincidència EXACTA a propòsit (regla
// 3.1 transversal — "lomo" no ha de portar "cabeza de lomo"), no substring,
// així que cap combobox de producte pot fer servir mode servidor per a
// cerca incremental — sempre es filtra en memòria un array ja carregat.
export const MAX_LOCAL_COMBOBOX_RESULTS = 8;

export function matchesProductQuery(product: ProducteApi, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return (
    product.descripcio.toLowerCase().includes(normalized) ||
    (product.codi ?? '').toLowerCase().includes(normalized)
  );
}
