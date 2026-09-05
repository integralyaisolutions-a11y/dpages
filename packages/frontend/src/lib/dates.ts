/**
 * Punto único de conversión de fecha/hora del contrato (ISO-8601 UTC, ej.
 * "2026-08-15T09:30:00Z" — docs/contrato-api.md §2) a la zona horaria de
 * Cataluña, tal como pide el propio contrato ("la conversión a hora local
 * se hace en el frontend, en un único punto").
 *
 * Decisión de negocio (revertida): todas las fechas de la app se muestran
 * sin hora, dd/mm/aaaa, sin excepción — "Data comanda" era la única que
 * mostraba hora a propósito, ya no. Ningún call site pasa `includeTime:
 * true` hoy. Se deja el parámetro (en vez de sacarlo) porque el dato
 * subyacente sigue llegando con hora real del backend y esta decisión ya
 * se revirtió una vez — si vuelve a hacer falta, no hay que tocar la
 * función, sólo el call site correspondiente.
 */
export function formatData(isoDateTime: string, includeTime: boolean): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return '—';
  const datePart = DATE_FORMATTER.format(date);
  if (!includeTime) return datePart;
  return `${datePart} ${TIME_FORMATTER.format(date)}`;
}

const MADRID_TZ = 'Europe/Madrid';

// Locale "en-GB" a propósito: formatea day/month/year como DD/MM/YYYY con
// "/" (el resultado que pide el criterio de la tarea) y hour/minute en
// 24h sin AM/PM — sin tener que ensamblar los parts a mano.
const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
