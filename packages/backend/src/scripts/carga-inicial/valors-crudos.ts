/**
 * Coerción de celdas crudas de ExcelJS a texto/número, compartida por los
 * tres validadores de carga-inicial/ (y por lectura-xlsx.ts, para los
 * encabezados). ExcelJS puede devolver un string, un number, un boolean,
 * un Date, null, o alguno de varios objetos (rich-text, fórmula,
 * hyperlink, error) — cada rama de acá narrowea explícitamente antes de
 * convertir a texto, nunca un `String(valor)` genérico sobre el union
 * completo (eso podría imprimir "[object Object]" para los casos raros).
 */
import type ExcelJS from 'exceljs';

function resultadoDeFormula(valor: object): string | number | undefined {
  if (!('result' in valor)) return undefined;
  const resultado = (valor as { result?: unknown }).result;
  return typeof resultado === 'string' || typeof resultado === 'number' ? resultado : undefined;
}

/** `''` si la celda está vacía o es un tipo que no sabemos convertir (hyperlink, error) — nunca null/undefined. */
export function celdaATexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') {
    if ('text' in valor && typeof (valor as { text: unknown }).text === 'string') {
      return (valor as { text: string }).text.trim();
    }
    if ('richText' in valor && Array.isArray(valor.richText)) {
      return valor.richText
        .map((r) => r.text)
        .join('')
        .trim();
    }
    const resultado = resultadoDeFormula(valor);
    if (resultado !== undefined) return String(resultado).trim();
  }
  return '';
}

/**
 * `null` = celda vacía (campo opcional, válido). `NaN` = la celda tenía
 * algo pero no es un número (campo inválido) — distinguible de `null` con
 * `Number.isNaN`, nunca se confunden.
 */
export function celdaANumero(valor: ExcelJS.CellValue): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') return Number(valor);
  if (typeof valor === 'object') {
    const resultado = resultadoDeFormula(valor);
    if (resultado !== undefined) return Number(resultado);
  }
  return NaN; // Date, richText, hyperlink, error... nunca son un número válido
}
