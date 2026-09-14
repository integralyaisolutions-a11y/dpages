'use client';

import { useEffect, useState, type RefObject } from 'react';

// Compartit entre SimpleDropdown i AsyncCombobox — abans cadascun tenia la
// seva pròpia còpia d'aquest càlcul (col·lisió amb el viewport + portal a
// document.body). Es va extreure aquí perquè és lògica no trivial que
// s'havia de mantenir idèntica als dos llocs; una còpia que es desincronitzés
// de l'altra en un futur ajust seria un bug silenciós.

// Modal.tsx fa servir z-[60] pel seu overlay — el panell ha de quedar per
// sobre d'un modal quan el dropdown viu dins d'un (cas real: Tarifa a
// ClientFormModal, via SimpleDropdown). InactivityWarningBanner ja fa servir
// z-[70] com a "per sobre de tot, sempre" — 65 queda per sobre del modal
// sense xocar amb això.
export const DROPDOWN_PANEL_Z_INDEX = 65;

// Detecció de col·lisió amb el viewport — bug real en laptops amb poca
// alçada efectiva (15.6" a 100% de zoom): el panell no es pot obrir sempre
// cap avall amb una alçada màxima fixa sense comprovar si aquest espai
// existeix de veritat entre el disparador i la vora inferior de la finestra.
const PANEL_MAX_HEIGHT_PX = 240; // mateix valor que l'antic max-h-60 (15rem), ara com a topall dinàmic.
const PANEL_GAP_PX = 4; // separació visual entre el disparador i el panell.
const VIEWPORT_MARGIN_PX = 8; // marge de seguretat respecte a la vora del viewport.
const MIN_DOWNWARD_SPACE_PX = 150; // per sota d'això, es prefereix amunt si hi ha més espai allà.

export type DropdownPanelPosition = { left: number; width: number; maxHeight: number } & (
  { direction: 'down'; top: number } | { direction: 'up'; bottom: number }
);

/**
 * Posició real (viewport, `fixed`) d'un panell de dropdown renderitzat via
 * portal a `document.body` — calculada des de l'element disparador
 * (`triggerRef`), recalculada mentre `isOpen` sigui cert si l'usuari
 * scrolleja (qualsevol ancestor, no només la finestra — per això
 * `capture: true`) o redimensiona la finestra.
 *
 * Motiu de `fixed` + portal en comptes de `absolute` dins del propi
 * contenidor: quan el dropdown viu dins d'un `Modal` (body `overflow-y-auto`
 * — ClientFormModal n'és l'exemple real), un descendent `absolute` que
 * s'estén més enllà del contingut normal SÍ compta per al "scrollable
 * overflow" d'aquest ancestor (part de l'espec de CSS), encara que no mogui
 * cap altre camp de lloc — dispara el scroll intern del modal sencer en
 * obrir el desplegable. Un portal amb `fixed` escapa per complet d'aquest
 * càlcul (el seu containing block és el viewport, no cap ancestor amb
 * overflow).
 */
export function useDropdownPosition(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
): DropdownPanelPosition | null {
  const [position, setPosition] = useState<DropdownPanelPosition | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN_PX;
      const spaceAbove = rect.top - VIEWPORT_MARGIN_PX;
      // Amunt només si abaix no arriba a l'alçada mínima raonable I hi ha
      // més espai real amunt que avall — mai amunt "porque sí" si avall ja
      // té prou lloc.
      const openUp = spaceBelow < MIN_DOWNWARD_SPACE_PX && spaceAbove > spaceBelow;
      // El menor entre el topall de sempre (240px) i l'espai real disponible
      // en aquella direcció — mai un valor fix que ignori l'espai real.
      const maxHeight = Math.max(
        0,
        Math.min(PANEL_MAX_HEIGHT_PX, openUp ? spaceAbove : spaceBelow),
      );

      setPosition(
        openUp
          ? {
              direction: 'up',
              bottom: window.innerHeight - rect.top + PANEL_GAP_PX,
              left: rect.left,
              width: rect.width,
              maxHeight,
            }
          : {
              direction: 'down',
              top: rect.bottom + PANEL_GAP_PX,
              left: rect.left,
              width: rect.width,
              maxHeight,
            },
      );
    }

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
    // triggerRef és un ref (identitat estable) — llegir .current dins de
    // l'efecte no necessita ser-hi com a dependència.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return position;
}
