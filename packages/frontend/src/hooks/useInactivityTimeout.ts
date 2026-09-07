'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'touchstart'] as const;

// mousemove dispara desenes de cops per segon mentre algú mou el ratolí —
// sense llindar, reprogramaríem els dos setTimeout de sota constantment
// només per algú que està llegint la pantalla quiet. 1s ja detecta de sobres
// "hi ha algú davant", sense fer falta cap llibreria de throttle nova
// (mateix criteri que el debounce a mà d'AsyncCombobox).
const MOUSEMOVE_THROTTLE_MS = 1000;

/**
 * Timer d'inactivitat genèric — no sap res de sessions ni de Firebase, això
 * ho decideix qui el consumeix (useAuth.tsx). Escolta NOMÉS activitat real
 * del navegador (click/tecla/ratolí/touch): a propòsit no hi ha cap listener
 * a fetch/XMLHttpRequest, perquè el polling o els refetch en segon pla d'un
 * hook no compten com "algú està fent servir la pantalla".
 *
 * `enabled=false` (sense sessió, p.ex. a /login) desmunta els listeners i
 * els timers del tot — no té sentit que corri sense ningú loguejat.
 */
export function useInactivityTimeout({
  enabled,
  warningAfterMs,
  timeoutAfterMs,
  onTimeout,
}: {
  enabled: boolean;
  warningAfterMs: number;
  timeoutAfterMs: number;
  onTimeout: () => void;
}): { isWarning: boolean; resetTimer: () => void } {
  const [isWarning, setIsWarning] = useState(false);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastMouseMoveRef = useRef(0);
  // Ref en comptes de dependència directa de l'efecte: `onTimeout` que rep
  // useAuth.tsx pot ser una funció nova a cada render (depèn de `logout`,
  // que al seu torn ve d'un useCallback amb les seves pròpies deps) — així
  // l'efecte de sota no es desmunta/remunta per això. S'actualitza en un
  // efecte propi, no durant el render (react-hooks/refs): sempre queda
  // al dia abans que cap timer pugui disparar-se, perquè els efectes
  // corren just després de cada commit.
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  // Patró "ajustar state durant el render" (documentat a React, no és un
  // efecte): quan `enabled` passa de false a true (login, o re-login després
  // d'un logout amb l'avís ja mostrat), neteja `isWarning` abans de pintar,
  // sense cap efecte ni render extra de més.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled) setIsWarning(false);
  }

  // Només programa els timers — cap crida a setState de manera síncrona
  // (les de dins dels setTimeout es disparen més tard, no en muntar
  // l'efecte), per això és segura de cridar directament des del cos de
  // l'efecte de sota (react-hooks/set-state-in-effect).
  const scheduleTimers = useCallback(() => {
    clearTimeout(warnTimerRef.current);
    clearTimeout(timeoutTimerRef.current);
    warnTimerRef.current = setTimeout(() => setIsWarning(true), warningAfterMs);
    timeoutTimerRef.current = setTimeout(() => onTimeoutRef.current(), timeoutAfterMs);
  }, [warningAfterMs, timeoutAfterMs]);

  // Per als handlers d'activitat real i el botó "Continuar": a més de
  // reprogramar, amaga l'avís si estava visible. Cridar setState des d'un
  // event listener (no des del cos de l'efecte) no ho marca cap regla.
  const resetTimer = useCallback(() => {
    setIsWarning(false);
    scheduleTimers();
  }, [scheduleTimers]);

  useEffect(() => {
    if (!enabled) return;

    scheduleTimers();

    function handleActivity(event: Event) {
      if (event.type === 'mousemove') {
        const now = Date.now();
        if (now - lastMouseMoveRef.current < MOUSEMOVE_THROTTLE_MS) return;
        lastMouseMoveRef.current = now;
      }
      resetTimer();
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity);
    }

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      clearTimeout(warnTimerRef.current);
      clearTimeout(timeoutTimerRef.current);
    };
  }, [enabled, scheduleTimers, resetTimer]);

  // `enabled &&`: si `enabled` passa a false amb l'avís ja mostrat (p.ex.
  // logout manual durant els 2 min d'avís), l'amaga a l'instant sense
  // dependre de cap efecte que "netegi" l'state per separat.
  return { isWarning: enabled && isWarning, resetTimer };
}
