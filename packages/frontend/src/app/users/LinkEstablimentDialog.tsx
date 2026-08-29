"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

/**
 * Es queda obert fins que l'Administrador el tanca explícitament — mai un
 * toast que desapareix sol. El backend no envia cap email (contrato §4.12):
 * aquest enllaç és d'un sol ús i, si es perd sense copiar-lo, l'única forma
 * de recuperar-lo és tornar a fer l'alta amb un altre email o que la
 * persona faci "he oblidat la contrasenya" un cop existeixi al login real.
 */
export function LinkEstablimentDialog({
  isOpen,
  nom,
  email,
  link,
  onClose,
}: {
  isOpen: boolean;
  nom: string;
  email: string;
  link: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Usuari creat">
      <p className="text-sm text-gray-600">
        S&apos;ha creat l&apos;usuari <strong>{nom}</strong> ({email}). Comparteix aquest enllaç amb la persona
        perquè estableixi la seva pròpia contrasenya — <strong>el sistema no envia cap email automàtic</strong>,
        s&apos;ha de compartir a mà (WhatsApp, correu personal, etc.). És d&apos;un sol ús.
      </p>
      <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs break-all text-gray-700">{link}</p>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Tancar
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {copied ? "Enllaç copiat!" : "Copiar enllaç"}
        </button>
      </div>
    </Modal>
  );
}
