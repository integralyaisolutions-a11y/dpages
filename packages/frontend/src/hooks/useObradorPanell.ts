// Hook aislado para el panel de obrador.
//
// El contrato de datos del panel de obrador todavía está en discusión con
// el backend (uno de los cuatro puntos abiertos, junto con
// transportistaDefecte, origen de comanda y tipo de búsqueda — ver
// docs/decisiones-arquitectura.md). Mientras no cierre, NINGÚN componente
// de UI debe llamar a lib/api.ts directamente para esto: todo pasa por
// este hook, así que cuando el contrato cambie el ajuste queda contenido
// acá adentro y no se propaga a los componentes.
//
// TODO: implementar la llamada real a lib/api.ts cuando el contrato del
// panel de obrador quede confirmado.

export function useObradorPanell() {
  // Placeholder: todavía no hay contrato confirmado con el backend.
  return undefined;
}
