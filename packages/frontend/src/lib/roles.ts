import type { UserRole } from "@/lib/api";

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
