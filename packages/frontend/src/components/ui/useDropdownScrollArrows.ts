import { useEffect, useRef, useState } from 'react';

// Mateixos passos que abans (SimpleDropdown): "increment petit i repetit"
// en comptes d'un salt únic, 8px cada 16ms ≈ 500px/s.
const AUTO_SCROLL_STEP_PX = 8;
const AUTO_SCROLL_INTERVAL_MS = 16;

/**
 * Fletxes d'auto-scroll (amunt/avall) per a un panell de desplegable amb la
 * barra de scroll nativa amagada (`.dropdown-panel-scroll`, globals.css) —
 * sense cap senyal visual, l'usuari no té manera de saber que hi ha més
 * contingut per veure. Extret de SimpleDropdown.tsx en portar el mateix
 * mecanisme a AsyncCombobox.tsx (2n consumidor real) — mateix criteri que
 * useDropdownPosition.ts: lògica pura (sense JSX), cada component manté el
 * seu propi marcatge de les fletxes perquè els estils del contenidor (radi
 * de vora, gradients) ja eren pràcticament idèntics però no valia la pena
 * forçar un component compartit només per a un parell de <div>.
 *
 * `contentLength` és el que dispara el recàlcul quan el contingut del
 * panell canvia mentre està obert (nombre d'opcions a SimpleDropdown,
 * nombre de resultats a AsyncCombobox) — sense això, canScrollDown quedaria
 * desactualitzat si una cerca nova retorna menys/més resultats que abans.
 */
export function useDropdownScrollArrows(
  panelEl: HTMLDivElement | null,
  isOpen: boolean,
  contentLength: number,
) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!panelEl) return;
    function updateScrollButtons() {
      if (!panelEl) return;
      setCanScrollUp(panelEl.scrollTop > 1);
      const remaining = panelEl.scrollHeight - panelEl.scrollTop - panelEl.clientHeight;
      setCanScrollDown(remaining > 1);
    }
    updateScrollButtons();
    panelEl.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      panelEl.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [panelEl, contentLength]);

  function stopAutoScroll() {
    if (autoScrollIntervalRef.current !== null) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }

  // Es neteja en tancar el panell — evita un interval corrent en va si
  // l'usuari deixa el ratolí sobre la fletxa just quan es tanca (click
  // fora, seleccionar una opció).
  useEffect(() => {
    if (!isOpen) stopAutoScroll();
  }, [isOpen]);

  function startAutoScroll(direction: 1 | -1) {
    stopAutoScroll();
    autoScrollIntervalRef.current = setInterval(() => {
      if (!panelEl) {
        stopAutoScroll();
        return;
      }
      const before = panelEl.scrollTop;
      panelEl.scrollTop += direction * AUTO_SCROLL_STEP_PX;
      // Ja no es mou (topall dalt o baix) — es para sol, no depèn només
      // del mouseleave (que no sempre arriba si l'element desapareix sota
      // el cursor en amagar-se la fletxa).
      if (panelEl.scrollTop === before) stopAutoScroll();
    }, AUTO_SCROLL_INTERVAL_MS);
  }

  return { canScrollUp, canScrollDown, startAutoScroll, stopAutoScroll };
}
