'use client';

import { useEffect } from 'react';
import type { Paginacio } from '@/lib/api';

/**
 * Hallazgo A (auditoria de paginació, Francesc) — corregeix `pagina` quan
 * la pàgina on estava l'usuari deixa d'existir per un motiu que NO és
 * canviar un filtre (l'únic cas que ja cobria el mecanisme de
 * `filtersKey`/`prevFiltersKey` repetit als 12 hooks paginats): esborrar
 * l'últim ítem de l'última pàgina, o editar una fila perquè deixi de
 * matxejar el filtre actiu. Sense això, la pantalla queda buida amb un
 * indicador trencat tipus "41-40 de 40" fins que l'usuari torna enrere a
 * mà — `Pagination.tsx` només deshabilita "Següent", no detecta ni
 * corregeix quedar fora de rang.
 *
 * `totalPagines === 0` (cap resultat, ex. filtre sense coincidències) MAI
 * dispara cap clamping — és un buit legítim, no un error a corregir.
 *
 * `enabled = false` desactiva el mecanisme sencer — pensat pel mode
 * "taula completa" (`mida` undefined a useCatalog.ts/useClientTariffs.ts),
 * on `paginacio` és sintètic (`paginacioTaulaCompleta`, sempre
 * `pagina: 1, totalPagines: 1`): matemàticament `pagina > totalPagines`
 * mai s'hi compliria sol, però es passa explícit perquè quedi clar al
 * llegir el hook que aquest mecanisme no hi té cap paper, en comptes de
 * confiar en un invariant implícit.
 *
 * Disseny (decisió explícita): NOMÉS s'extreu aquest fix puntual a un
 * hook compartit, no la resta del patró de fetch (encara duplicat als 12
 * hooks). Fusionar tot el fetch/mutacions en un únic hook megagran hauria
 * tocat els 12 alhora sense cap xarxa de seguretat de tests per a hooks
 * de frontend en aquest projecte (a diferència del backend) — massa risc
 * per a un bug que, en realitat, només necessita aquest únic efecte
 * afegit. Cada hook crida `usePageClamp(paginacio, setPagina)` un cop,
 * sense tocar la seva pròpia lògica de fetch/mutació.
 */
export function usePageClamp(
  paginacio: Paginacio | null,
  setPagina: (pagina: number) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !paginacio) return;
    if (paginacio.totalPagines > 0 && paginacio.pagina > paginacio.totalPagines) {
      setPagina(paginacio.totalPagines);
    }
  }, [enabled, paginacio, setPagina]);
}
