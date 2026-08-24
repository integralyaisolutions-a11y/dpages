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
}: {
  variant: IconButtonVariant;
  label: string;
  onClick?: () => void;
}) {
  const Icon = VARIANT_ICON[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${VARIANT_STYLES[variant]}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
