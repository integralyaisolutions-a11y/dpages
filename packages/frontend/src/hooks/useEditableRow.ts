"use client";

import { useState } from "react";

export function useEditableRow<T extends Record<string, unknown>>(initialValues: T, onSave: (values: T) => void) {
  const [draft, setDraft] = useState<T>(initialValues);

  function setField<K extends keyof T>(field: K, value: T[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function reset() {
    setDraft(initialValues);
  }

  function save() {
    onSave(draft);
  }

  const isDirty = (Object.keys(initialValues) as (keyof T)[]).some((key) => draft[key] !== initialValues[key]);

  return { draft, setField, save, reset, isDirty };
}
