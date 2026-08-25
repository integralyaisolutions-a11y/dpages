"use client";

import type { ReactNode } from "react";

export function DataCard({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50"
      >
        {children}
      </button>
    );
  }
  return <div className="rounded-xl border border-gray-200 bg-white p-4">{children}</div>;
}

export function DataCardGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 }) {
  return (
    <dl className={`grid gap-x-3 gap-y-2 text-sm ${columns === 1 ? "grid-cols-1" : "grid-cols-2"}`}>{children}</dl>
  );
}

export function DataCardField({
  label,
  children,
  tone = "default",
}: {
  label: string;
  children: ReactNode;
  tone?: "default" | "negative";
}) {
  if (tone === "negative") {
    return (
      <div className="rounded-md bg-red-600 px-2 py-1.5">
        <dt className="text-xs text-red-100">{label}</dt>
        <dd className="font-medium text-white">{children}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}

export function DataCardActions({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex items-center gap-2">{children}</div>;
}
