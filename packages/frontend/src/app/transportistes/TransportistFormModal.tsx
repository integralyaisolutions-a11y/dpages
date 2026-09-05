'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/TextField';
import type { CarrierFormValues } from '@/hooks/useCarriers';
import { ApiError, type TransportistaApi } from '@/lib/api';

type FieldErrors = { nom?: string };

export function TransportistFormModal({
  mode,
  initialData,
  isOpen,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  initialData?: TransportistaApi;
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: CarrierFormValues) => Promise<void>;
}) {
  const [nom, setNom] = useState(initialData?.nom ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const nomInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    nomInputRef.current?.focus();
    if (mode === 'edit') nomInputRef.current?.select();
  }, [isOpen, mode]);

  async function handleSave() {
    const trimmedName = nom.trim();
    if (!trimmedName) {
      setFieldErrors({ nom: 'El nom no pot estar buit.' });
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setIsSaving(true);
    try {
      await onSave({ nom: trimmedName });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const nextFieldErrors: FieldErrors = {};
        for (const detall of caught.detalls ?? []) {
          if (detall.camp === 'nom') nextFieldErrors.nom = detall.missatge;
        }
        if (Object.keys(nextFieldErrors).length > 0) {
          setFieldErrors(nextFieldErrors);
        } else {
          // Qualsevol error sense `detalls` per camp (aquest formulari ja no
          // manda `codi`, així que el 409 de codi duplicat no es pot
          // disparar des d'acá) cau al missatge genèric del formulari.
          setFormError(caught.message);
        }
      } else {
        setFormError("No s'ha pogut desar el transportista.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Nou transportista' : 'Modificar transportista'}
    >
      <div className="flex flex-col gap-4">
        <TextField
          ref={nomInputRef}
          label="Nom"
          value={nom}
          onChange={(event) => setNom(event.target.value)}
          error={fieldErrors.nom}
        />
        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel·lar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Desant...' : 'Desar'}
        </button>
      </div>
    </Modal>
  );
}
