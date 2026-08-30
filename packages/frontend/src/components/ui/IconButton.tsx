"use client";

import { Pencil, Trash2, XCircle } from "lucide-react";

type IconButtonVariant = "edit" | "delete" | "warning";

const VARIANT_ICON = {
  edit: Pencil,
  delete: Trash2,
  warning: XCircle,
} as const;

const VARIANT_STYLES: Record<IconButtonVariant, string> = {
  edit: "text-blue-500 hover:text-blue-600",
  delete: "text-red-500 hover:text-red-600",
  warning: "text-red-500 hover:text-red-600",
};

export function IconButton({
  variant,
  label,
  onClick,
  disabled,
  className = "",
}: {
  variant: IconButtonVariant;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Classes utilitàries addicionals (ex. `shrink-0` dins d'una fila flex amb un sibling `w-full`). */
  className?: string;
}) {
  const Icon = VARIANT_ICON[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:text-gray-300 ${VARIANT_STYLES[variant]} ${className}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
