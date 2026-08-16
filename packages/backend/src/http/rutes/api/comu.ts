import type { Paginacio } from '@dpages/shared';
import type { FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { cosError } from '../../error-api.js';

export const MIDA_PAGINA_DEFECTE = 50;
export const MIDA_PAGINA_MAXIMA = 200;

export interface OpcionsPaginacio {
  pagina: number;
  mida: number;
  offset: number;
}

/** `?pagina=1&mida=50` (contrato, sección 2) — mida entre 1 y 200, default 50; pagina mínima 1. */
export function parsearPaginacio(query: Record<string, unknown>): OpcionsPaginacio {
  const pagina = Math.max(1, Math.trunc(Number(query.pagina)) || 1);
  const midaBruta = Math.trunc(Number(query.mida)) || MIDA_PAGINA_DEFECTE;
  const mida = Math.min(MIDA_PAGINA_MAXIMA, Math.max(1, midaBruta));
  return { pagina, mida, offset: (pagina - 1) * mida };
}

export function construirPaginacio(pagina: number, mida: number, total: number): Paginacio {
  return { pagina, mida, total, totalPagines: Math.ceil(total / mida) };
}

/**
 * ISO-8601 UTC con "Z" (contrato, sección 2) — `Date.toISOString()` ya lo
 * hace, salvo que incluye milisegundos, que el contrato no pide
 * (`"2026-08-15T09:30:00Z"`, no `"...T09:30:00.000Z"`).
 */
export function formatearDataApi(data: Date | string | null | undefined): string | null {
  if (data === null || data === undefined) return null;
  const fecha = data instanceof Date ? data : new Date(data);
  return fecha.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function enviarValidacio(
  reply: FastifyReply,
  missatge: string,
  detalls?: { camp: string; missatge: string }[],
): void {
  reply.code(400).send(cosError('VALIDACIO', missatge, detalls));
}

export function enviarNoTrobat(reply: FastifyReply, missatge = 'No trobat'): void {
  reply.code(404).send(cosError('NO_TROBAT', missatge));
}

export function enviarConflicte(reply: FastifyReply, missatge: string): void {
  reply.code(409).send(cosError('CONFLICTE', missatge));
}

/**
 * `:id` de la URL siempre es el entero secuencial público (id_seq), nunca
 * el UUID interno — ver ADR-019. `null` si el parámetro ni siquiera es un
 * entero válido (evita una consulta a la base para algo que ya sabemos que
 * no puede existir).
 */
export function parsearIdPublic(valor: string): number | null {
  if (!/^\d+$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) ? id : null;
}

async function resolverUuid(pool: Pool, taula: string, idSeq: number): Promise<string | null> {
  // `taula` nunca viene de una petición: siempre es uno de los literales de
  // abajo, fijados en el código — interpolarlo acá no es una inyección SQL.
  const res = await pool.query<{ id: string }>(`SELECT id FROM ${taula} WHERE id_seq = $1`, [
    idSeq,
  ]);
  return res.rows[0]?.id ?? null;
}

export const resolverProducteUuid = (pool: Pool, idSeq: number): Promise<string | null> =>
  resolverUuid(pool, 'producte', idSeq);
export const resolverCategoriaUuid = (pool: Pool, idSeq: number): Promise<string | null> =>
  resolverUuid(pool, 'categoria_producte', idSeq);
export const resolverTarifaUuid = (pool: Pool, idSeq: number): Promise<string | null> =>
  resolverUuid(pool, 'tarifa', idSeq);
export const resolverClientUuid = (pool: Pool, idSeq: number): Promise<string | null> =>
  resolverUuid(pool, 'client', idSeq);
export const resolverTransportistaUuid = (pool: Pool, idSeq: number): Promise<string | null> =>
  resolverUuid(pool, 'transportista', idSeq);
export const resolverComandaUuid = (pool: Pool, idSeq: number): Promise<string | null> =>
  resolverUuid(pool, 'comanda', idSeq);
