// Hook para leer y operar sobre comandas (pedidos).
//
// Único punto de acceso a comandas desde la UI: usa los tipos *Api de
// lib/api.ts, nunca tipos propios (no crear comanda.ts suelto).
//
// Dos puntos del contrato con el backend siguen en discusión y afectan
// a este hook: el origen de la comanda (web / correo / WhatsApp /
// teléfono) y el tipo de búsqueda soportado. Mientras no cierren, se
// resuelven acá adentro, no en los componentes.
//
// TODO: implementar la llamada real a lib/api.ts cuando el contrato
// quede confirmado.

export function useComandes() {
  // Placeholder: aún sin implementación.
  return undefined;
}
