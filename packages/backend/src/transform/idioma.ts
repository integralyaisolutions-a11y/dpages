import type { WooProduct } from '@dpages/shared';
import { logger } from '../lib/logger.js';

/**
 * HEURÍSTICA PROVISORIA — no hay ningún campo confiable de idioma en la
 * respuesta real de /products (verificado: ver docs/hallazgos-woocommerce.md).
 * Se infiere por el nombre de categoría, contra los 16 pares catalán/
 * castellano observados en el catálogo real. Cada par comparte un nombre
 * CANÓNICO (siempre el catalán, idioma de salida por defecto del sistema):
 * sirve tanto para inferir el idioma del producto como para resolver la
 * categoría real sin que "Fresc" y "Fresco" terminen siendo dos categorías
 * distintas en el sistema (ver `resolverNomCategoriaCanonic`).
 *
 * Se reemplaza en cuanto el cliente confirme los campos de agrupación del
 * catálogo (pendiente, ver "Pendientes de definición" en
 * docs/contexto-negocio.md) — esa sesión probablemente trae una fuente de
 * verdad mejor para el idioma también.
 *
 * Si aparece una categoría nueva no listada acá, no se puede resolver el
 * par — se cae a valores por defecto razonables, siempre con un log de
 * advertencia, nunca en silencio.
 */
interface InfoCategoria {
  idioma: 'ca' | 'es';
  /** Siempre el nombre catalán del par — es el nombre "real" de la categoría en el sistema. */
  nomCanonic: string;
}

const INFO_PER_CATEGORIA: Readonly<Record<string, InfoCategoria>> = {
  Fresc: { idioma: 'ca', nomCanonic: 'Fresc' },
  Fresco: { idioma: 'es', nomCanonic: 'Fresc' },
  'Vedella Eco': { idioma: 'ca', nomCanonic: 'Vedella Eco' },
  'Ternera Eco': { idioma: 'es', nomCanonic: 'Vedella Eco' },
  'LOTS KETO': { idioma: 'ca', nomCanonic: 'LOTS KETO' },
  'LOTES KETO': { idioma: 'es', nomCanonic: 'LOTS KETO' },
  'Lots Eco': { idioma: 'ca', nomCanonic: 'Lots Eco' },
  'Lotes Eco': { idioma: 'es', nomCanonic: 'Lots Eco' },
  Conserves: { idioma: 'ca', nomCanonic: 'Conserves' },
  Conservas: { idioma: 'es', nomCanonic: 'Conserves' },
  Elaborat: { idioma: 'ca', nomCanonic: 'Elaborat' },
  Elaborado: { idioma: 'es', nomCanonic: 'Elaborat' },
  Curat: { idioma: 'ca', nomCanonic: 'Curat' },
  Curado: { idioma: 'es', nomCanonic: 'Curat' },
  'Embotits cuits': { idioma: 'ca', nomCanonic: 'Embotits cuits' },
  'Embutidos cocidos': { idioma: 'es', nomCanonic: 'Embotits cuits' },
  'Pollastre Eco': { idioma: 'ca', nomCanonic: 'Pollastre Eco' },
  'Pollo Eco': { idioma: 'es', nomCanonic: 'Pollastre Eco' },
  Nadal: { idioma: 'ca', nomCanonic: 'Nadal' },
  Navidad: { idioma: 'es', nomCanonic: 'Nadal' },
  'Xai Eco': { idioma: 'ca', nomCanonic: 'Xai Eco' },
  'Cordero Eco': { idioma: 'es', nomCanonic: 'Xai Eco' },
  'Sal eco dels Pirineus': { idioma: 'ca', nomCanonic: 'Sal eco dels Pirineus' },
  'Sal eco de los Pirineos': { idioma: 'es', nomCanonic: 'Sal eco dels Pirineus' },
  'Vísceres ecològiques': { idioma: 'ca', nomCanonic: 'Vísceres ecològiques' },
  'Vísceras ecológicas': { idioma: 'es', nomCanonic: 'Vísceres ecològiques' },
  SAMARRETES: { idioma: 'ca', nomCanonic: 'SAMARRETES' },
  CAMISETAS: { idioma: 'es', nomCanonic: 'SAMARRETES' },
  'Làctics eco': { idioma: 'ca', nomCanonic: 'Làctics eco' },
  'Lácticos eco': { idioma: 'es', nomCanonic: 'Làctics eco' },
  'Ous Eco': { idioma: 'ca', nomCanonic: 'Ous Eco' },
  'Huevos Eco': { idioma: 'es', nomCanonic: 'Ous Eco' },
};

const IDIOMA_POR_DEFECTO = 'ca';

export function inferirIdiomaHeuristic(
  producte: Pick<WooProduct, 'id' | 'categories'>,
): 'ca' | 'es' {
  for (const categoria of producte.categories) {
    const info = INFO_PER_CATEGORIA[categoria.name];
    if (info) return info.idioma;
  }

  logger.warn(
    { wooProductId: producte.id },
    'No se pudo inferir el idioma por categoría (heurística) — se usa el default',
  );
  return IDIOMA_POR_DEFECTO;
}

/**
 * Nombre canónico de una categoría, para que "Fresc" y "Fresco" resuelvan a
 * la MISMA fila de `categoria_producte`. Si el nombre no está en la lista
 * verificada, se usa tal cual llega (mejor esfuerzo) — con advertencia,
 * porque puede terminar generando una categoría "equivalente" duplicada si
 * en algún momento aparece también su par en el otro idioma.
 */
export function resolverNomCategoriaCanonic(nomCrud: string): string {
  const info = INFO_PER_CATEGORIA[nomCrud];
  if (info) return info.nomCanonic;

  logger.warn(
    { nomCategoria: nomCrud },
    'Categoría no reconocida por la heurística — se usa el nombre tal cual llega (posible duplicado si aparece su par en el otro idioma)',
  );
  return nomCrud;
}
