"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  Layers,
  List,
  Menu,
  Package,
  Tag,
  X,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Categories", href: "/categories", icon: Layers },
  { label: "Catàleg", href: "/catalog", icon: Boxes },
  { label: "Llistat de Tarifes", href: "/rates", icon: List },
  { label: "Tarifes per client", href: "/client-tariffs", icon: Tag },
  { label: "Comandes", href: "/orders", icon: Package },
  { label: "Rendiments Porcs", href: "/pig-yields", icon: ClipboardList },
  { label: "Panell Oficina", href: "/office", icon: LayoutGrid },
  { label: "Panell Producció", href: "/production", icon: LayoutGrid },
  { label: "Panell Obrador", href: "/workshop", icon: LayoutGrid },
  { label: "Panell Empaquetat", href: "/packaging", icon: LayoutGrid },
];

function SidebarContent({
  collapsed,
  onNavigate,
  onToggleCollapse,
  onClose,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex items-center justify-between px-5 pt-6 pb-5">
          {!collapsed && (
            <div>
              <p className="text-base font-bold text-gray-900">Gestió de Comandes</p>
              <p className="text-sm text-gray-400">Panell operatiu</p>
            </div>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expandir menú" : "Col·lapsar menú"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tancar menú"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-ink text-white" : "text-gray-700 hover:bg-gray-100"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="px-3 pb-6">
        {!collapsed && <p className="px-1 text-xs text-gray-400">v0.1 · Sense autenticació</p>}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
        <span className="text-sm font-bold text-gray-900">Gestió de Comandes</span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Obrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-500"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-gray-200 bg-white transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
      </aside>

      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-gray-200 bg-white transition-all duration-200 lg:block ${
          collapsed ? "w-20" : "w-72"
        }`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={() => setCollapsed((value) => !value)} />
      </aside>
    </>
  );
}
