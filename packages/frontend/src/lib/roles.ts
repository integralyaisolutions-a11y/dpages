import type { UserRole } from "@/lib/api";

// ── Ruteo real, por mòdul (hooks/useAuth.tsx) ────────────────────────────
//
// El backend real no tiene los 4 roles fijos de abajo (ROLE_ROUTES) — tiene
// dos roles ("Administrador"/"General") con un array `modulsPermesos` por
// usuario (contrato §4.12, ADR-021). Esta sección reemplaza a la de abajo
// para la sesión autenticada real; ROLE_ROUTES/ROLE_LABELS quedan sólo para
// el mock de `/users` (fuera de alcance de esta sesión, ver lib/api.ts).
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

// ── Mock legado de `/users` (fuera de alcance, ver lib/api.ts) ──────────

export const ROLE_ROUTES: Record<UserRole, string[]> = {
  office: ["/rates", "/client-tariffs", "/orders", "/office"],
  workshop: ["/workshop"],
  packaging: ["/packaging"],
  production: [
    "/categories",
    "/catalog",
    "/rates",
    "/client-tariffs",
    "/orders",
    "/pig-yields",
    "/office",
    "/workshop",
    "/packaging",
    "/production",
    "/users",
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  office: "Oficina",
  workshop: "Obrador",
  packaging: "Empaquetat",
  production: "Producció",
};

export function firstAllowedRoute(role: UserRole): string {
  return ROLE_ROUTES[role][0];
}

export function isRouteAllowed(role: UserRole, pathname: string): boolean {
  return ROLE_ROUTES[role].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
