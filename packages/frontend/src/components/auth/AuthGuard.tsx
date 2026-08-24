"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { firstAllowedRoute, isRouteAllowed } from "@/lib/roles";

const PUBLIC_ROUTES = ["/login"];
const SHARED_ROUTES = ["/profile"];

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const isShared = SHARED_ROUTES.includes(pathname);
  const isAllowedForRole = user ? isShared || isRouteAllowed(user.role, pathname) : false;

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      if (!isPublic) router.replace("/login");
      return;
    }

    if (isPublic || !isAllowedForRole) {
      router.replace(firstAllowedRoute(user.role));
    }
  }, [user, isLoading, isPublic, isAllowedForRole, router]);

  if (isLoading) return null;
  if (!user) return isPublic ? <>{children}</> : null;
  if (isPublic || !isAllowedForRole) return null;

  return <>{children}</>;
}
