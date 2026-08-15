import { formatearFechaGmt, parsearFechaGmt } from './fechas.js';

/**
 * modified_after tiene granularidad de segundo y semántica EXCLUSIVA (trae
 * registros con date_modified_gmt > el valor dado, no >=). El solapamiento
 * cubre tanto ese borde como la ventana entre el fin de una corrida y el
 * inicio de la siguiente.
 */
export const SOLAPAMENT_MS_DEFECTE = 5 * 60 * 1000;

export interface FinestraConsulta {
  /** true = no había cursor previo → carga completa (sin modified_after). */
  esCarregaCompleta: boolean;
  modifiedAfter: string | undefined;
}

export function calcularFinestraConsulta(
  cursorPrevi: Date | null,
  solapamentMs: number = SOLAPAMENT_MS_DEFECTE,
): FinestraConsulta {
  if (cursorPrevi === null) {
    return { esCarregaCompleta: true, modifiedAfter: undefined };
  }
  const ambSolapament = new Date(cursorPrevi.getTime() - solapamentMs);
  return { esCarregaCompleta: false, modifiedAfter: formatearFechaGmt(ambSolapament) };
}

/**
 * El nuevo cursor es el date_modified_gmt más reciente visto en el lote.
 * `null` si el lote vino vacío — en ese caso el llamador tiene que
 * conservar el cursor anterior tal cual (nunca inventar uno nuevo ni
 * retroceder).
 */
export function calcularNouCursor(dataModificacioGmt: readonly string[]): Date | null {
  let max: Date | null = null;
  for (const gmt of dataModificacioGmt) {
    const fecha = parsearFechaGmt(gmt);
    if (max === null || fecha.getTime() > max.getTime()) max = fecha;
  }
  return max;
}
