"use client";

import { X } from "lucide-react";
import { Children, useEffect, type ReactNode } from "react";

export function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Convenció implícita que ja compleixen els 10 usos actuals de Modal
  // (formularis i ConfirmDialog): el darrer fill directe és sempre la fila
  // de botons (Cancel·lar/Desar). Es treu del flux normal de children per
  // deixar-lo sempre visible fora de la zona amb scroll, sense necessitat
  // de cap prop `footer` nova ni tocar cap dels llocs que ja fan servir
  // aquest component. Un futur Modal que no acabi amb aquesta fila de
  // botons com a últim fill directe trencaria aquest supòsit.
  const items = Children.toArray(children);
  const footer = items.length > 0 ? items[items.length - 1] : null;
  const body = items.length > 0 ? items.slice(0, -1) : items;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div role="presentation" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tancar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">{body}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
