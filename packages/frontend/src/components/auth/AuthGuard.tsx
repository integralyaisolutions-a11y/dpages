'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { firstAllowedRouteForModules, isModuleRouteAllowed } from '@/lib/roles';

const PUBLIC_ROUTES = ['/login'];
const SHARED_ROUTES = ['/profile'];
// "Canviar contrasenya" des del perfil (logged in) i "Has oblidat la
// contrasenya?" des de /login (logged out) porten totes dues acá —
// l'enllaç de l'email pot arribar en qualsevol dels dos estats
// d'autenticació segons des d'on es va demanar. A diferència de
// PUBLIC_ROUTES (que fa fora a qui ja té sessió, com /login), aquesta
// pàgina no ha de redirigir mai en cap direcció: resol el seu propi flux
// per codi (oobCode a la URL), no per l'estat de sessió d'aquest guard.
const ALWAYS_ACCESSIBLE_ROUTES = ['/action'];

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAlwaysAccessible = ALWAYS_ACCESSIBLE_ROUTES.includes(pathname);
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const isShared = SHARED_ROUTES.includes(pathname);
  const isAllowedForRole = user
    ? isShared || isModuleRouteAllowed(user.rol.modulsPermesos, pathname)
    : false;

  useEffect(() => {
    if (isAlwaysAccessible || isLoading) return;

    if (!user) {
      if (!isPublic) router.replace('/login');
      return;
    }

    if (isPublic || !isAllowedForRole) {
      router.replace(firstAllowedRouteForModules(user.rol.modulsPermesos));
    }
  }, [user, isLoading, isPublic, isAllowedForRole, isAlwaysAccessible, router]);

  if (isAlwaysAccessible) return <>{children}</>;
  if (isLoading) return null;
  if (!user) return isPublic ? <>{children}</> : null;
  if (isPublic || !isAllowedForRole) return null;

  return <>{children}</>;
}
