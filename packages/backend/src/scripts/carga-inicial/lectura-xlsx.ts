/**
 * Lectura genérica de un .xlsx a filas de objetos, usada por los tres
 * importadores de carga-inicial/. La primera fila de la hoja es el
 * encabezado (nombres de columna tal cual, sin normalizar) — cada fila
 * siguiente se convierte en un objeto `{ columna: valor }`.
 *
 * No valida nada acá — sólo aplana el .xlsx a datos crudos. La validación
 * de negocio (categoría existe, format/envasat válidos, etc.) vive en cada
 * importador, como función pura separada, para poder testearla con
 * fixtures en memoria sin tocar un archivo real.
 */
import ExcelJS from 'exceljs';
import { celdaATexto } from './valors-crudos.js';

export interface FilaCruda {
  /** Número de fila real del .xlsx (1 = encabezado, así que la primera fila de datos es 2) — para mensajes de error legibles. */
  fila: number;
  valors: Record<string, ExcelJS.CellValue>;
}

/**
 * Filas completamente vacías (todas las celdas null/undefined/cadena
 * vacía) se descartan — Excel deja huecos así con frecuencia al editar a
 * mano, no es una fila de datos real.
 */
function filaVacia(valors: Record<string, ExcelJS.CellValue>): boolean {
  return Object.values(valors).every((v) => v === null || v === undefined || v === '');
}

export async function leerHojaXlsx(rutaArchivo: string, nombreHoja?: string): Promise<FilaCruda[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(rutaArchivo);

  const hoja = nombreHoja ? workbook.getWorksheet(nombreHoja) : workbook.worksheets[0];
  if (!hoja) {
    throw new Error(
      `No se encontró la hoja "${nombreHoja ?? '(primera)'}" en ${rutaArchivo}. ` +
        `Hojas disponibles: ${workbook.worksheets.map((h) => h.name).join(', ')}`,
    );
  }

  const encabezados: string[] = [];
  hoja.getRow(1).eachCell({ includeEmpty: true }, (celda, numCol) => {
    encabezados[numCol - 1] = celdaATexto(celda.value);
  });

  const filas: FilaCruda[] = [];
  hoja.eachRow((fila, numFila) => {
    if (numFila === 1) return; // encabezado

    const valors: Record<string, ExcelJS.CellValue> = {};
    fila.eachCell({ includeEmpty: true }, (celda, numCol) => {
      const encabezado = encabezados[numCol - 1];
      if (encabezado) valors[encabezado] = celda.value;
    });

    if (filaVacia(valors)) return;
    filas.push({ fila: numFila, valors });
  });

  return filas;
}
