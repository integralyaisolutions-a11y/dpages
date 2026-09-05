'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type ComboboxOption = { id: number; label: string };

/**
 * Combobox con búsqueda: input de texto que dispara `loadOptions(query)`
 * con debounce y muestra un dropdown con los resultados reales — nunca
 * carga un listado completo de una, a diferencia de un <select> nativo.
 *
 * Sirve para dos modos según qué le pases a `loadOptions`, sin que el
 * componente sepa la diferencia:
 * - Servidor (Client en Oficina/Comandes): `loadOptions` pega a
 *   `GET .../?cerca=` — necesita debounce real (300ms) para no saturar
 *   la red en cada tecla.
 * - Local (Producte en Comandes): `loadOptions` filtra en memoria un
 *   array ya cargado y envuelve el resultado en `Promise.resolve(...)`
 *   — no pega a la red, por eso el caller pasa `debounceMs={0}`.
 *
 * `onChange` entrega la opción completa (`{id, label}`), no sólo el id:
 * así ningún caller necesita guardar un array completo aparte sólo para
 * poder mostrar el texto de lo ya seleccionado (ver Panell Oficina, que
 * ya no carga los 200 clients de golpe una vez que dejó de necesitarlos
 * para poblar el <select>).
 *
 * `displayValue` es lo que se muestra cuando el campo no está en edición
 * activa. `clearable` (default true) agrega una X para volver a `null`
 * — el <select> nativo que reemplaza siempre tenía una opción "Tots"/
 * "Selecciona..." como escape; sin esto sería una regresión real.
 */
export function AsyncCombobox({
  label,
  value,
  displayValue,
  onChange,
  loadOptions,
  debounceMs = 300,
  placeholder,
  disabled,
  clearable = true,
}: {
  label?: string;
  value: number | null;
  displayValue: string;
  onChange: (option: ComboboxOption | null) => void;
  loadOptions: (query: string) => Promise<ComboboxOption[]>;
  debounceMs?: number;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Descarta resultados de una búsqueda vieja que llega tarde (network
  // fuera de orden) — sólo el request más reciente puede escribir `options`.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isEditing) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsEditing(false);
        setQuery('');
        setOptions([]);
      }
    }

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing]);

  // Arranca vacío, sin dropdown, hasta que el usuario escribe — mismo
  // criterio para los 3 usos, sin precargar nada aunque loadOptions sea
  // local y "gratis" de llamar.
  useEffect(() => {
    if (!isEditing || query.trim() === '') {
      setOptions([]);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    const timeoutId = setTimeout(() => {
      loadOptions(query.trim())
        .then((results) => {
          if (requestIdRef.current === requestId) setOptions(results);
        })
        .catch(() => {
          if (requestIdRef.current === requestId) setOptions([]);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setIsLoading(false);
        });
    }, debounceMs);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isEditing, debounceMs]);

  function selectOption(option: ComboboxOption) {
    onChange(option);
    setIsEditing(false);
    setQuery('');
    setOptions([]);
  }

  function clearSelection() {
    onChange(null);
    setQuery('');
    setIsEditing(false);
  }

  const showDropdown = isEditing && query.trim() !== '';
  const showClearButton = clearable && !disabled && !isEditing && value !== null;

  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label && <span className="font-medium text-gray-900">{label}</span>}
      <div ref={containerRef} className="relative">
        <input
          type="text"
          value={isEditing ? query : displayValue}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setIsEditing(true)}
          onChange={(event) => setQuery(event.target.value)}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 ${
            showClearButton ? 'pr-8' : ''
          }`}
        />
        {showClearButton && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Netejar selecció"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {showDropdown && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {isLoading && <p className="px-3 py-2 text-sm text-gray-500">Cercant...</p>}
            {!isLoading && options.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-500">Sense resultats.</p>
            )}
            {!isLoading &&
              options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectOption(option)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    option.id === value ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </label>
  );
}
