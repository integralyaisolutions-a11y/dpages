"use client";

import type { ReactNode } from "react";

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-white p-6">
      {children}
    </div>
  );
}

export function ClearFiltersButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:self-end"
    >
      Netejar filtres
    </button>
  );
}
