// Hook para leer tarifas.
//
// Único punto de acceso a tarifas desde la UI: usa los tipos *Api de
// lib/api.ts, nunca tipos propios (no crear client.ts ni similares
// sueltos).
//
// El campo transportistaDefecte todavía está en discusión con el
// backend (uno de los cuatro puntos abiertos). Mientras no cierre, se
// resuelve acá adentro, no en los componentes.
//
// TODO: implementar la llamada real a lib/api.ts cuando el contrato
// quede confirmado.

export function useTarifes() {
  // Placeholder: aún sin implementación.
  return undefined;
}
