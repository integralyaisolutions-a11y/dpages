"use client";

import { Modal } from "@/components/ui/Modal";

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancel·lar",
  onConfirm,
  onCancel,
  errorMessage,
  isConfirming,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Mensaje de error de la última confirmación fallida (ej. 409 CONFLICTE del backend) — se muestra dentro del propio diálogo, sin cerrarlo. */
  errorMessage?: string | null;
  /** Deshabilita el botón de confirmar mientras la acción está en curso — evita doble click/doble request. */
  isConfirming?: boolean;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <p className="text-sm text-gray-600">{message}</p>
      {errorMessage && <p className="mt-3 text-sm text-red-600">{errorMessage}</p>}
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={onCancel} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isConfirming}
          className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConfirming ? "Eliminant..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
