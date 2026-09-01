import type { BadgeVariant } from "@/components/ui/Badge";

/**
 * Mapeig codi d'origen → variant de Badge, compartit entre el llistat de
 * Comandes i el detall/edició (OrderForm.tsx) perquè els dos mostrin
 * exactament el mateix color per al mateix origen. manual = neutral (valor
 * històric, no elegible per a comandes noves); la resta, ver comentari a
 * Badge.tsx.
 */
const ORIGEN_BADGE_VARIANT: Record<string, BadgeVariant> = {
  manual: "neutral",
  woocommerce: "purple",
  whatsapp: "amber",
  telefon: "orange",
  correu: "yellow",
};

/** `neutral` de reserva per a qualsevol codi futur no contemplat encara acá. */
export function origenBadgeVariant(codi: string): BadgeVariant {
  return ORIGEN_BADGE_VARIANT[codi] ?? "neutral";
}
