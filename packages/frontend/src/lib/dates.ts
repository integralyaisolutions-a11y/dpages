/**
 * Punto único de conversión de fecha/hora del contrato (ISO-8601 UTC, ej.
 * "2026-08-15T09:30:00Z" — docs/contrato-api.md §2) a la zona horaria de
 * Cataluña, tal como pide el propio contrato ("la conversión a hora local
 * se hace en el frontend, en un único punto").
 *
 * `includeTime` es explícito a propósito, no inferido del string de
 * entrada: dos campos con el mismo formato ISO pueden significar cosas
 * distintas (un instante puntual vs. una fecha de referencia), y esa
 * decisión es de negocio, no de formato. Ver la tabla de criterio en cada
 * call site.
 */
export function formatData(isoDateTime: string, includeTime: boolean): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = DATE_FORMATTER.format(date);
  if (!includeTime) return datePart;
  return `${datePart} ${TIME_FORMATTER.format(date)}`;
}

const MADRID_TZ = "Europe/Madrid";

// Locale "en-GB" a propósito: formatea day/month/year como DD/MM/YYYY con
// "/" (el resultado que pide el criterio de la tarea) y hour/minute en
// 24h sin AM/PM — sin tener que ensamblar los parts a mano.
const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: MADRID_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: MADRID_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
