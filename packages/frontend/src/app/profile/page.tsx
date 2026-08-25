"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/hooks/useAuth";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div>
      <PageHeader title="El meu perfil" />

      <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6">
        <dl className="flex flex-col gap-4">
          <Field label="Nom">{user.nom}</Field>
          <Field label="Email">{user.email}</Field>
          <Field label="Rol">
            <Badge variant="info">{user.rol.nom}</Badge>
          </Field>
          <Field label="Estat">
            <Badge variant={user.actiu ? "positive" : "negative"}>{user.actiu ? "Actiu" : "Inactiu"}</Badge>
          </Field>
        </dl>
      </div>
    </div>
  );
}
