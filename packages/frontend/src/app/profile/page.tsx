"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/hooks/useAuth";

const TOO_MANY_REQUESTS_MESSAGE = "Massa intents seguits. Espera uns minuts abans de tornar-ho a provar.";
const UNKNOWN_ERROR_MESSAGE = "No s'ha pogut enviar l'enllaç. Torna-ho a provar.";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user, requestPasswordReset } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  if (!user) return null;

  async function handleConfirm() {
    if (!user) return;
    setIsSending(true);
    setDialogError(null);

    const result = await requestPasswordReset(user.email);

    if (!result.ok && result.reason === "too-many-requests") {
      setDialogError(TOO_MANY_REQUESTS_MESSAGE);
    } else if (!result.ok) {
      setDialogError(UNKNOWN_ERROR_MESSAGE);
    } else {
      setSentMessage(`T'hem enviat un enllaç a ${user.email} per canviar la contrasenya.`);
      setIsDialogOpen(false);
    }
    setIsSending(false);
  }

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

        <div className="mt-6 border-t border-gray-100 pt-6">
          {sentMessage && (
            <p className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {sentMessage}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setDialogError(null);
              setSentMessage(null);
              setIsDialogOpen(true);
            }}
            className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Canviar contrasenya
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDialogOpen}
        title="Canviar contrasenya"
        message={`Enviar enllaç a ${user.email}?`}
        confirmLabel="Enviar enllaç"
        confirmingLabel="Enviant..."
        onConfirm={handleConfirm}
        onCancel={() => setIsDialogOpen(false)}
        errorMessage={dialogError}
        isConfirming={isSending}
      />
    </div>
  );
}
