/**
 * Forma de error del contrato (docs/contrato-api.md, sección "Errores"):
 * { error: { codi, missatge, detalls? } } en cualquier código de estado.
 */
export type CodiErrorApi =
  'VALIDACIO' | 'NO_AUTENTICAT' | 'SENSE_PERMIS' | 'NO_TROBAT' | 'CONFLICTE' | 'ERROR_INTERN';

export interface DetallErrorApi {
  camp: string;
  missatge: string;
}

export interface CosErrorApi {
  error: {
    codi: CodiErrorApi;
    missatge: string;
    detalls?: DetallErrorApi[];
  };
}

export function cosError(
  codi: CodiErrorApi,
  missatge: string,
  detalls?: DetallErrorApi[],
): CosErrorApi {
  return { error: { codi, missatge, ...(detalls ? { detalls } : {}) } };
}
