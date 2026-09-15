'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { useNavigationGuard } from '@/hooks/useNavigationGuard';

/**
 * Wrapper de <Link> de next/link que interfereix la navegació quan hi ha
 * canvis sense desar (NavigationGuardProvider, issue #15). `onNavigate` és
 * l'única API real de Next per interceptar un clic de <Link> (v15.3+,
 * confirmat contra node_modules/next/dist/docs/.../link.md) — "Only
 * executes during SPA navigation", no cobreix router.push/replace
 * imperatiu ni el botó enrere del navegador.
 *
 * `href` es tipa com a string (no com el `Url` complet que accepta next/
 * link) perquè és l'únic ús real d'aquest projecte (grep de <Link
 * confirmat) — evita haver de resoldre un UrlObject a string per fer el
 * router.push manual de sota.
 */
export function GuardedLink({
  href,
  onNavigate,
  ...rest
}: Omit<ComponentProps<typeof NextLink>, 'href'> & { href: string }) {
  const router = useRouter();
  const { isDirty, confirmNavigation } = useNavigationGuard();

  return (
    <NextLink
      href={href}
      onNavigate={(event) => {
        if (isDirty) {
          event.preventDefault();
          confirmNavigation(() => router.push(href));
          return;
        }
        onNavigate?.(event);
      }}
      {...rest}
    />
  );
}
