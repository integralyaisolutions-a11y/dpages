'use client';

/**
 * A propòsit NO és el component Modal compartit: Modal porta un backdrop
 * que bloqueja clics a la resta de la pantalla i es tanca en clicar fora —
 * aquest avís ha de ser NO bloquejant (l'usuari ha de poder seguir
 * treballant mentre és visible; qualsevol interacció normal ja compta com
 * activitat i el fa desaparèixer sol via useInactivityTimeout).
 */
export function InactivityWarningBanner({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
      <div
        role="alert"
        className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 shadow-lg"
      >
        <p className="text-sm text-amber-800">
          La teva sessió es tancarà per inactivitat en 2 minuts.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="shrink-0 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
