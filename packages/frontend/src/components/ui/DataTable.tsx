"use client";

import type { ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-gray-200">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableHeaderCell({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-6 py-3 font-medium text-gray-500 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

export function TableRow({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-100 last:border-0 ${onClick ? "cursor-pointer hover:bg-gray-50" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  align = "left",
  negative = false,
}: {
  children: ReactNode;
  align?: "left" | "right";
  negative?: boolean;
}) {
  return (
    <td
      className={`px-6 py-4 ${align === "right" ? "text-right" : "text-left"} ${
        negative ? "bg-red-600 font-medium text-white" : "text-gray-900"
      }`}
    >
      {children}
    </td>
  );
}
