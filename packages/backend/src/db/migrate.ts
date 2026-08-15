import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const TABLA_MIGRACIONES = 'esquema_migraciones';

const NOMBRE_ARCHIVO_RE = /^(\d{4})_([a-z0-9_]+)\.up\.sql$/;

interface Migracion {
  id: number;
  archivo: string;
  contenido: string;
  checksum: string;
}

interface FilaAplicada {
  id: number;
  nombre_archivo: string;
  checksum: string;
  aplicada_en: Date;
}

export interface EstadoMigracion {
  id: number;
  archivo: string;
  aplicada: boolean;
  aplicadaEn: Date | null;
  /** false = el archivo en disco ya no coincide con lo que se aplicó (ver verificarIntegridad). */
  hashCoincide: boolean;
}

function calcularChecksum(contenido: string): string {
  return createHash('sha256').update(contenido, 'utf8').digest('hex');
}

/**
 * Lee y parsea los archivos NNNN_nombre.up.sql de un directorio de
 * migraciones. Pura: no toca la base. El parámetro `dir` sólo existe para
 * poder testear el runner contra migraciones de prueba sin usar las reales.
 */
export function leerMigraciones(dir: string = MIGRATIONS_DIR): Migracion[] {
  const archivos = readdirSync(dir).filter((f) => f.endsWith('.up.sql'));

  const migraciones = archivos.map((archivo): Migracion => {
    const match = NOMBRE_ARCHIVO_RE.exec(archivo);
    if (!match) {
      throw new Error(
        `Nombre de migración inválido: "${archivo}". Formato esperado: NNNN_nombre.up.sql`,
      );
    }
    const [, idStr] = match;
    const contenido = readFileSync(path.join(dir, archivo), 'utf8');
    return {
      id: Number(idStr),
      archivo,
      contenido,
      checksum: calcularChecksum(contenido),
    };
  });

  migraciones.sort((a, b) => a.id - b.id);

  const ids = new Set<number>();
  for (const m of migraciones) {
    if (ids.has(m.id)) {
      throw new Error(`Hay más de una migración con el número ${m.id}: revisá los archivos.`);
    }
    ids.add(m.id);
  }

  return migraciones;
}

async function asegurarTablaMigraciones(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLA_MIGRACIONES} (
      id             INTEGER PRIMARY KEY,
      nombre_archivo TEXT NOT NULL UNIQUE,
      checksum       TEXT NOT NULL,
      aplicada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function leerAplicadas(client: Client): Promise<Map<number, FilaAplicada>> {
  const res = await client.query<FilaAplicada>(
    `SELECT id, nombre_archivo, checksum, aplicada_en FROM ${TABLA_MIGRACIONES} ORDER BY id`,
  );
  return new Map(res.rows.map((fila) => [fila.id, fila]));
}

/**
 * Si el archivo de una migración YA aplicada cambió de contenido, corta acá
 * antes de tocar nada más. Es el error más difícil de detectar cuando dos
 * personas tocan migraciones en paralelo — no se resuelve solo, hay que
 * agregar una migración nueva, nunca editar una ya aplicada.
 */
function verificarIntegridad(migraciones: Migracion[], aplicadas: Map<number, FilaAplicada>): void {
  for (const m of migraciones) {
    const fila = aplicadas.get(m.id);
    if (fila && fila.checksum !== m.checksum) {
      throw new Error(
        `La migración ${m.archivo} ya fue aplicada (${fila.aplicada_en.toISOString()}) ` +
          `con un contenido distinto al que tiene ahora en disco (el hash no coincide). ` +
          `Las migraciones aplicadas no se editan — agregá una migración nueva.`,
      );
    }
  }

  for (const [id, fila] of aplicadas) {
    if (!migraciones.some((m) => m.id === id)) {
      throw new Error(
        `La migración ${fila.nombre_archivo} está aplicada en la base pero su archivo ya no existe.`,
      );
    }
  }
}

/**
 * Aplica las migraciones pendientes, cada una en su propia transacción: si
 * una falla, las anteriores quedan aplicadas y registradas (no se revierte
 * todo el lote). Correrla sin migraciones pendientes es un no-op — así de
 * idempotente es correrla dos veces seguidas.
 */
export async function migrarArriba(
  client: Client,
  dir: string = MIGRATIONS_DIR,
): Promise<{ aplicadas: string[] }> {
  const migraciones = leerMigraciones(dir);
  await asegurarTablaMigraciones(client);
  const aplicadas = await leerAplicadas(client);

  verificarIntegridad(migraciones, aplicadas);

  const pendientes = migraciones.filter((m) => !aplicadas.has(m.id));
  const nombresAplicados: string[] = [];

  for (const m of pendientes) {
    try {
      await client.query('BEGIN');
      await client.query(m.contenido);
      await client.query(
        `INSERT INTO ${TABLA_MIGRACIONES} (id, nombre_archivo, checksum) VALUES ($1, $2, $3)`,
        [m.id, m.archivo, m.checksum],
      );
      await client.query('COMMIT');
      nombresAplicados.push(m.archivo);
    } catch (err) {
      await client.query('ROLLBACK');
      const detalle = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Falló la migración ${m.archivo} — se revirtió sólo ella. ` +
          `Las anteriores de esta corrida (${nombresAplicados.join(', ') || 'ninguna'}) quedan aplicadas y registradas. ` +
          `Detalle: ${detalle}`,
      );
    }
  }

  return { aplicadas: nombresAplicados };
}

export async function obtenerEstado(
  client: Client,
  dir: string = MIGRATIONS_DIR,
): Promise<EstadoMigracion[]> {
  const migraciones = leerMigraciones(dir);
  await asegurarTablaMigraciones(client);
  const aplicadas = await leerAplicadas(client);

  return migraciones.map((m) => {
    const fila = aplicadas.get(m.id);
    return {
      id: m.id,
      archivo: m.archivo,
      aplicada: fila !== undefined,
      aplicadaEn: fila?.aplicada_en ?? null,
      hashCoincide: fila ? fila.checksum === m.checksum : true,
    };
  });
}

function formatearFecha(fecha: Date | null): string {
  if (!fecha) return '—';
  return fecha.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

async function imprimirEstado(client: Client): Promise<boolean> {
  const estado = await obtenerEstado(client);
  const anchoArchivo = Math.max(...estado.map((e) => e.archivo.length), 'Migración'.length);

  console.log(`${'Migración'.padEnd(anchoArchivo)}  Estado      Aplicada en`);
  for (const e of estado) {
    const etiqueta = !e.aplicada ? 'pendiente' : e.hashCoincide ? 'aplicada' : '⚠ MODIFICADA';
    console.log(
      `${e.archivo.padEnd(anchoArchivo)}  ${etiqueta.padEnd(10)}  ${formatearFecha(e.aplicadaEn)}`,
    );
  }

  return estado.some((e) => e.aplicada && !e.hashCoincide);
}

async function main(): Promise<void> {
  const comando = process.argv[2] ?? 'up';
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    if (comando === 'status') {
      const hayProblemas = await imprimirEstado(client);
      if (hayProblemas) process.exitCode = 1;
    } else if (comando === 'up') {
      const { aplicadas } = await migrarArriba(client);
      if (aplicadas.length === 0) {
        console.log('Nada para aplicar — la base ya está al día.');
      } else {
        console.log(`Aplicadas ${aplicadas.length}: ${aplicadas.join(', ')}`);
      }
    } else {
      console.error(`Comando desconocido: "${comando}". Usar: migrate [up|status]`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  await main();
}
