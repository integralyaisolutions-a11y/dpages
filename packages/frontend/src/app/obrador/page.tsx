// Panel de obrador.
//
// Sólo lectura: filtros y subtotales sobre comandas. El contrato de
// datos de este panel todavía está en discusión con el backend, así
// que toda la lectura pasa por hooks/useObradorPanell.ts (nunca directo
// desde este componente). Acceso restringido por rol "obrador" vía
// Firebase Auth.

export default function ObradorPage() {
  return <div>Panell d&apos;obrador</div>;
}
