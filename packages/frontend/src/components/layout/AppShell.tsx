"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";

const FULL_SCREEN_ROUTES = ["/login"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (FULL_SCREEN_ROUTES.includes(pathname)) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 px-6 pt-20 pb-10 lg:px-12 lg:pt-10">{children}</main>
    </div>
  );
}
