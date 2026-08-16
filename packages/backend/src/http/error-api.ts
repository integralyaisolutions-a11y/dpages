import type { CodiErrorApi, CosErrorApi, DetallErrorApi } from '@dpages/shared';

/**
 * Forma de error del contrato (docs/contrato-api.md, sección "Errores"):
 * { error: { codi, missatge, detalls? } } en cualquier código de estado.
 * Los tipos viven en @dpages/shared (Michel los importa igual que el resto
 * del contrato); esta función es sólo un helper de construcción, no hace
 * falta en el frontend.
 */
export type { CodiErrorApi, CosErrorApi, DetallErrorApi };

export function cosError(
  codi: CodiErrorApi,
  missatge: string,
  detalls?: DetallErrorApi[],
): CosErrorApi {
  return { error: { codi, missatge, ...(detalls ? { detalls } : {}) } };
}
