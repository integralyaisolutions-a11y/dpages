// ── Ruteo real, por mòdul (hooks/useAuth.tsx) ────────────────────────────
//
// El backend real tiene dos roles sembrados ("Administrador"/"General") con
// un array `modulsPermesos` por usuario (contrato §4.12, ADR-021) — la
// pantalla /users (hooks/useUsers.ts, hooks/useRols.ts) gestiona roles
// reales contra este mismo modelo, no hay ningún concepto de "rol fijo"
// separado.
//
// Actualizado tras capa 39 (fix señalado por Gerardo): el backend YA NO es
// una capa sin restricción por módulo — POST /usuaris siempre tuvo guard, y
// desde la capa 39 también lo tienen PATCH /usuaris/:id y POST/PATCH/DELETE
// /rols (los 5 validan `crearGuardaModul('usuaris')`, ver comu.ts/rols.ts/
// usuaris.ts). El resto de los endpoints de negocio sigue sin restringir por
// rol/mòdul — `modulsPermesos` ahí sólo decide qué mostrar en el menú — pero
// ya no es cierto que NINGÚN endpoint lo haga. Esta función replica en el
// frontend la misma restricción de navegación que antes (mismo
// comportamiento), ahora contra el dato real.
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
  transportistes: ["/transportistes"],
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
  "transportistes",
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
  transportistes: "Transportistes",
};
