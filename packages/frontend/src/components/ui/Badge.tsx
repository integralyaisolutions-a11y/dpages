import type { ReactNode } from "react";

type BadgeVariant = "neutral" | "info" | "positive" | "negative";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-blue-50 text-blue-700",
  positive: "bg-green-50 text-green-700",
  negative: "bg-red-50 text-red-700",
};

export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${VARIANT_STYLES[variant]}`}
    >
      {children}
    </span>
  );
}
