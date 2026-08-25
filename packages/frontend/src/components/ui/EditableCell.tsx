"use client";

import { useState } from "react";

function defaultFormat(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

export function EditableCell({
  value,
  onChange,
  formatValue = defaultFormat,
  step = "0.01",
  originalValue = null,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  formatValue?: (value: number) => string;
  step?: string;
  /** Último valor guardado en el backend (no el draft). Si no es null, la celda no se puede dejar vacía: al perder el foco sin contenido, vuelve a este valor en vez de quedar en null — el backend no tiene forma de "borrar" un precio ya cargado, sólo de sobrescribirlo. */
  originalValue?: number | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [valueAtEditStart, setValueAtEditStart] = useState<number | null>(null);

  function startEditing() {
    setValueAtEditStart(value);
    setIsEditing(true);
  }

  function handleChange(raw: string) {
    const trimmed = raw.trim().replace(",", ".");
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) onChange(parsed);
  }

  function handleBlur() {
    if (value === null && originalValue !== null) onChange(originalValue);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <input
        type="number"
        step={step}
        autoFocus
        defaultValue={value ?? ""}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            onChange(valueAtEditStart);
            setIsEditing(false);
          }
        }}
        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-right text-sm text-gray-900 hover:border-gray-400 hover:bg-gray-50"
    >
      {value === null ? "—" : formatValue(value)}
    </button>
  );
}
