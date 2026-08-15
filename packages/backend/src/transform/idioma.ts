import type { WooProduct } from '@dpages/shared';
import { logger } from '../lib/logger.js';

/**
 * HEURÍSTICA PROVISORIA — no hay ningún campo confiable de idioma en la
 * respuesta real de /products (verificado: ver docs/hallazgos-woocommerce.md).
 * Se infiere por el nombre de categoría, contra los 16 pares catalán/
 * castellano observados en el catálogo real. Se reemplaza en cuanto el
 * cliente confirme los campos de agrupación del catálogo (pendiente, ver
 * "Pendientes de definición" en docs/contexto-negocio.md) — esa sesión
 * probablemente trae una fuente de verdad mejor para el idioma también.
 *
 * Si aparece una categoría nueva no listada acá, o el producto no tiene
 * categorías, no se puede inferir — se cae a 'ca' (idioma de salida por
 * defecto del sistema) con un log de advertencia, nunca en silencio.
 */
const IDIOMA_PER_CATEGORIA: Readonly<Record<string, 'ca' | 'es'>> = {
  Fresc: 'ca',
  Fresco: 'es',
  'Vedella Eco': 'ca',
  'Ternera Eco': 'es',
  'LOTS KETO': 'ca',
  'LOTES KETO': 'es',
  'Lots Eco': 'ca',
  'Lotes Eco': 'es',
  Conserves: 'ca',
  Conservas: 'es',
  Elaborat: 'ca',
  Elaborado: 'es',
  Curat: 'ca',
  Curado: 'es',
  'Embotits cuits': 'ca',
  'Embutidos cocidos': 'es',
  'Pollastre Eco': 'ca',
  'Pollo Eco': 'es',
  Nadal: 'ca',
  Navidad: 'es',
  'Xai Eco': 'ca',
  'Cordero Eco': 'es',
  'Sal eco dels Pirineus': 'ca',
  'Sal eco de los Pirineos': 'es',
  'Vísceres ecològiques': 'ca',
  'Vísceras ecológicas': 'es',
  SAMARRETES: 'ca',
  CAMISETAS: 'es',
  'Làctics eco': 'ca',
  'Lácticos eco': 'es',
  'Ous Eco': 'ca',
  'Huevos Eco': 'es',
};

const IDIOMA_POR_DEFECTO = 'ca';

export function inferirIdiomaHeuristic(
  producte: Pick<WooProduct, 'id' | 'categories'>,
): 'ca' | 'es' {
  for (const categoria of producte.categories) {
    const idioma = IDIOMA_PER_CATEGORIA[categoria.name];
    if (idioma) return idioma;
  }

  logger.warn(
    { wooProductId: producte.id },
    'No se pudo inferir el idioma por categoría (heurística) — se usa el default',
  );
  return IDIOMA_POR_DEFECTO;
}
