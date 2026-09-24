'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Issue #15 — abans de crear aquest guard NO existia cap
 * mecanisme de "canvis sense desar" enlloc del projecte (confirmat per
 * grep de beforeunload/onNavigate/unsaved a tot src/, investigació
 * prèvia). Next.js App Router (v16.3.1, docs reals a
 * node_modules/next/dist/docs) NO té cap forma d'interceptar
 * `router.push`/`back`/`forward` — l'única API real és `onNavigate` a
 * `<Link>` (v15.3+), que només dispara en clics d'un `<Link>` concret.
 * Per això calen DOS mecanismes independents, cap dels dos cobreix l'altre
 * cas:
 *  - `beforeunload` (natiu del navegador): tancar pestanya/recarregar. El
 *    missatge que veu l'usuari NO es pot personalitzar — tots els
 *    navegadors moderns ignoren `event.returnValue` des de fa anys
 *    (mesura anti-phishing), mostren sempre el seu propi text genèric.
 *  - `onNavigate` de cada `<Link>` (via GuardedLink) + un `confirmNavigation`
 *    genèric per a accions imperatives (com "Tancar sessió"): cobreix
 *    navegació dins l'app. El botó enrere/endavant del navegador
 *    (popstate) NO té cap mecanisme d'intercepció documentat en aquesta
 *    versió — limitació coneguda i acceptada, no una omissió.
 *
 * `isDirty` és un únic flag global (Provider a app/layout.tsx, per sobre
 * de Sidebar i de qualsevol pàgina) perquè el Sidebar viu fora de l'arbre
 * de la pàgina que en realitat sap si hi ha canvis — cal un Context que
 * arribi a tots dos. Qui el fa servir (OrderForm via un prop
 * `onDirtyChange`) és responsable de netejar-lo (`setIsDirty(false)`) en
 * desmuntar-se — si no, un flag `true` quedaria bloquejant TOTA la
 * navegació de la resta de l'app per sempre.
 */
type NavigationGuardContextValue = {
  isDirty: boolean;
  setIsDirty: (value: boolean) => void;
  /**
   * Sempre difereix `action` i mostra el ConfirmDialog — NO comprova
   * `isDirty` per si sol. Qui crida ha de decidir abans si cal diferir
   * (GuardedLink només hi arriba quan `isDirty` ja és true) o cridar
   * `action` directament quan no hi ha res sense guardar.
   */
  confirmNavigation: (action: () => void) => void;
};

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Requerit per disparar el diàleg natiu a Chrome/Firefox — el valor
      // en si no es mostra mai (ver comentari de dalt).
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  function confirmNavigation(action: () => void) {
    pendingActionRef.current = action;
    setIsConfirmOpen(true);
  }

  function handleConfirmExit() {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsConfirmOpen(false);
    setIsDirty(false);
    action?.();
  }

  function handleCancelExit() {
    pendingActionRef.current = null;
    setIsConfirmOpen(false);
  }

  return (
    <NavigationGuardContext.Provider value={{ isDirty, setIsDirty, confirmNavigation }}>
      {children}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Sortir sense desar?"
        message="Tens canvis sense desar en aquest formulari. Si surts ara, es perdran."
        confirmLabel="Sortir sense desar"
        cancelLabel="Quedar-se"
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
      />
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  const context = useContext(NavigationGuardContext);
  if (!context) {
    throw new Error("useNavigationGuard s'ha de fer servir dins de NavigationGuardProvider");
  }
  return context;
}
