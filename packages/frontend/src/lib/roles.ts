// ── Ruteo real, por mòdul (hooks/useAuth.tsx) ────────────────────────────
//
// El backend real tiene dos roles sembrados ("Administrador"/"General") con
// un array `modulsPermesos` por usuario (contrato §4.12, ADR-021) — la
// pantalla /users (hooks/useUsers.ts, hooks/useRols.ts) gestiona roles
// reales contra este mismo modelo, no hay ningún concepto de "rol fijo"
// separado.
//
// Nota de negocio sin resolver (AUDITORIA_FRONTEND.md §1 y §9): el backend
// documentó explícitamente que NINGÚN endpoint debería restringir acceso
// por rol/mòdul — `modulsPermesos` es sólo para decidir qué mostrar en el
// menú. Esta función sigue restringiendo la navegación (mismo comportamiento
// que ya tenía el frontend), sólo que ahora contra el dato real en vez de
// uno inventado — decidir si esa restricción debería sacarse del todo es
// una decisión de producto pendiente, no tomada acá.
export const MODUL_ROUTES: Record<string, string[]> = {
  categories: ["/categories"],
  catalog: ["/catalog"],
  tarifes: ["/rates"],
  "tarifes-clients": ["/client-tariffs"],
  comandes: ["/orders"],
  "rendiments-porcs": ["/pig-yields"],
  "panell-oficina": ["/office"],
  "panell-obrador": ["/workshop"],
  "panell-empaquetat": ["/packaging"],
  "panell-produccio": ["/production"],
  usuaris: ["/users"],
};

const FALLBACK_ROUTE = "/profile";

export function firstAllowedRouteForModules(modulsPermesos: string[]): string {
  for (const modul of modulsPermesos) {
    const routes = MODUL_ROUTES[modul];
    if (routes) return routes[0];
  }
  return FALLBACK_ROUTE;
}

export function isModuleRouteAllowed(modulsPermesos: string[], pathname: string): boolean {
  return modulsPermesos.some((modul) =>
    (MODUL_ROUTES[modul] ?? []).some((route) => pathname === route || pathname.startsWith(`${route}/`)),
  );
}

// ── Els 12 mòduls reals (migració 0014_usuaris_i_rols.up.sql, confirmat) ──
//
// "rols" no té ruta pròpia (viu dins de /users, mateixa pantalla que
// "usuaris") — per això no és a MODUL_ROUTES, però sí és un mòdul real que
// es pot assignar a un rol.
export const MODULS_VALIDS = [
  "categories",
  "catalog",
  "tarifes",
  "tarifes-clients",
  "comandes",
  "rendiments-porcs",
  "panell-oficina",
  "panell-obrador",
  "panell-empaquetat",
  "panell-produccio",
  "usuaris",
  "rols",
] as const;

export const MODUL_LABELS: Record<string, string> = {
  categories: "Categories",
  catalog: "Catàleg",
  tarifes: "Tarifes",
  "tarifes-clients": "Tarifes de clients",
  comandes: "Comandes",
  "rendiments-porcs": "Rendiments de porcs",
  "panell-oficina": "Panell d'Oficina",
  "panell-obrador": "Panell d'Obrador",
  "panell-empaquetat": "Panell d'Empaquetat",
  "panell-produccio": "Panell de Producció",
  usuaris: "Usuaris",
  rols: "Rols",
};
