import { formatearFechaGmt, parsearFechaGmt } from './fechas.js';

/**
 * modified_after tiene granularidad de segundo y semántica EXCLUSIVA (trae
 * registros con date_modified_gmt > el valor dado, no >=). El solapamiento
 * cubre tanto ese borde como la ventana entre el fin de una corrida y el
 * inicio de la siguiente.
 */
export const SOLAPAMENT_MS_DEFECTE = 5 * 60 * 1000;

/** Ver ADR-017: sin cursor previo, la carga inicial se acota a estos días hacia atrás por defecto. */
export const DIES_ENRERE_CARGA_INICIAL_DEFECTE = 30;

export interface FinestraConsulta {
  /** true = no había cursor_sincronitzacio previo para este recurso — es la primera carga. */
  esPrimeraCarrega: boolean;
  /**
   * true = sin modified_after — trae TODO el histórico. Sólo ocurre en la
   * primera carga y sólo si se pidió explícitamente (INGESTA_HISTORIC_COMPLET),
   * nunca por defecto (ver ADR-017).
   */
  esCarregaCompleta: boolean;
  modifiedAfter: string | undefined;
}

/**
 * `diesEnrereCargaInicial` sólo importa cuando `cursorPrevi` es `null`
 * (primera carga de este recurso): `null` pide el histórico completo sin
 * acotar (caso deliberado, ver INGESTA_HISTORIC_COMPLET), cualquier número
 * acota la primera carga a esos días hacia atrás. No tiene ningún efecto
 * sobre el incremental normal (cuando ya hay cursor).
 */
export function calcularFinestraConsulta(
  cursorPrevi: Date | null,
  solapamentMs: number = SOLAPAMENT_MS_DEFECTE,
  diesEnrereCargaInicial: number | null = DIES_ENRERE_CARGA_INICIAL_DEFECTE,
): FinestraConsulta {
  if (cursorPrevi === null) {
    if (diesEnrereCargaInicial === null) {
      return { esPrimeraCarrega: true, esCarregaCompleta: true, modifiedAfter: undefined };
    }
    const desde = new Date(Date.now() - diesEnrereCargaInicial * 24 * 60 * 60 * 1000);
    return {
      esPrimeraCarrega: true,
      esCarregaCompleta: false,
      modifiedAfter: formatearFechaGmt(desde),
    };
  }

  const ambSolapament = new Date(cursorPrevi.getTime() - solapamentMs);
  return {
    esPrimeraCarrega: false,
    esCarregaCompleta: false,
    modifiedAfter: formatearFechaGmt(ambSolapament),
  };
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
