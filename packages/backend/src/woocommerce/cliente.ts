import { setTimeout as esperar } from 'node:timers/promises';
import type { WooOrder, WooProduct, WooProductVariation } from '@dpages/shared';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Cliente de SÓLO LECTURA para la API REST v3 de WooCommerce (ADR-001:
 * /wp-json/wc/v3/, nunca la legacy). Estructuralmente de sólo lectura: acá
 * abajo no hay ningún parámetro de método HTTP en ningún punto del módulo,
 * así que no existe forma de construir un POST/PUT/DELETE aunque alguien
 * quisiera — la única función de bajo nivel (`peticionGet`) siempre hace GET.
 *
 * Las seis reglas obligatorias de consulta (ver
 * docs/hallazgos-woocommerce.md y el agente woocommerce-integration) se
 * aplican todas acá, una sola vez: un recurso nuevo las hereda sin que
 * nadie tenga que acordarse de repetirlas.
 */

const PER_PAGE = 100;
const REINTENTOS_MAXIMOS = 5;
const ESPERA_BASE_MS = 500;
const ESPERA_MAXIMA_MS = 10_000;
const TIMEOUT_PETICION_MS = 20_000;

/**
 * dates_are_gmt, orderby, order y per_page: van último en la URL para que
 * ningún parámetro del llamador los pueda pisar. status=any es una regla
 * más, pero sólo aplica a /orders — no es universal, así que vive en
 * `listarPedidos`, no acá.
 */
const PARAMS_OBLIGATORIOS = {
  dates_are_gmt: 'true',
  orderby: 'modified',
  order: 'asc',
  per_page: String(PER_PAGE),
} as const;

export class ErrorWooCommerce extends Error {
  constructor(
    public readonly recurso: string,
    public readonly status: number | null,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorWooCommerce';
  }
}

/**
 * Capa 41 — dpages.cat descarta el header `Authorization` antes de que
 * llegue a WordPress (confirmado con curl directo: el header da 401, el
 * mismo par de credenciales por query string da 200). WooCommerce/WordPress
 * soportan las dos formas oficialmente (REST API Handbook), así que esto
 * no es un workaround frágil — es simplemente el mecanismo que el
 * servidor real de este cliente sí deja pasar. Van en la MISMA posición
 * que `PARAMS_OBLIGATORIOS` (spread al final de `construirUrl`) para que
 * ningún parámetro del llamador los pueda pisar.
 */
function credencialsWoo(): Record<string, string> {
  return {
    consumer_key: env.WC_CONSUMER_KEY,
    consumer_secret: env.WC_CONSUMER_SECRET,
  };
}

/**
 * Red de seguridad — no la única barrera, pero sí obligatoria: desde que
 * las credenciales viajan en el query string (capa 41), cualquier texto
 * que las contenga y termine en un log, o en una columna de auditoría
 * (`esdeveniment_webhook.error` en webhook.ts,
 * `cursor_sincronitzacio.ultim_error` en sync/ingesta.ts — ambos guardan
 * tal cual el `.message` de lo que este módulo termina lanzando), las
 * expondría en texto plano. El único punto real de riesgo en todo el
 * módulo es más abajo (el mensaje de un `fetch` fallido, que Node/undici
 * arma con contenido que no controlamos) — se redacta el query string
 * COMPLETO ahí, no sólo `consumer_key`/`consumer_secret`: más simple y más
 * seguro que aislar por nombre de parámetro (un error de regex ahí sería
 * exactamente el tipo de bug que termina filtrando credenciales). El resto
 * del mensaje (qué recurso, cuántos reintentos) se conserva — no hace
 * falta perder todo el diagnóstico para no filtrar el secreto. Sanitizar
 * en ESTE único punto (no en cada `catch` de webhook.ts/ingesta.ts) alcanza
 * porque este módulo es el único lugar de todo el backend que llama
 * `fetch` — cualquier error relacionado con WooCommerce pasa por acá.
 */
function redactarUrlEnTexto(texto: string): string {
  return texto.replace(/\?\S*/g, '?[redactat]');
}

function construirUrl(recurso: string, params: Record<string, string>): URL {
  const base = env.WC_BASE_URL.replace(/\/+$/, '') + '/wp-json/wc/v3/';
  const url = new URL(recurso, base);
  for (const [clave, valor] of Object.entries({
    ...params,
    ...PARAMS_OBLIGATORIOS,
    ...credencialsWoo(),
  })) {
    url.searchParams.set(clave, valor);
  }
  return url;
}

function esReintentable(status: number): boolean {
  return status === 429 || status >= 500;
}

function calcularEspera(intento: number, retryAfter: string | null): number {
  if (retryAfter !== null) {
    const segundos = Number(retryAfter);
    if (Number.isFinite(segundos) && segundos >= 0) {
      return Math.min(segundos * 1000, ESPERA_MAXIMA_MS);
    }
  }
  return Math.min(ESPERA_BASE_MS * 2 ** (intento - 1), ESPERA_MAXIMA_MS);
}

/**
 * Única función que llama a fetch en todo el módulo, y siempre sin
 * `method` (GET implícito). Reintenta con espera creciente ante 429/5xx y
 * ante fallos de red, hasta REINTENTOS_MAXIMOS veces. El error final nunca
 * incluye el cuerpo de la respuesta — puede traer datos personales de
 * clientes reales.
 */
async function peticionGet(recurso: string, params: Record<string, string>): Promise<Response> {
  const url = construirUrl(recurso, params);

  for (let intento = 1; intento <= REINTENTOS_MAXIMOS + 1; intento++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_PETICION_MS),
      });
    } catch (err) {
      if (intento > REINTENTOS_MAXIMOS) {
        // redactarUrlEnTexto: err.message puede traer la URL completa —
        // con credenciales en el query string desde esta capa — armada por
        // Node/undici, no por este módulo. Ver la nota en la función.
        const mensaje = err instanceof Error ? err.message : String(err);
        throw new ErrorWooCommerce(
          recurso,
          null,
          `Sin respuesta de WooCommerce en "${recurso}" tras ${REINTENTOS_MAXIMOS} reintentos: ${redactarUrlEnTexto(mensaje)}`,
        );
      }
      logger.warn({ recurso, intento }, 'Fallo de red hacia WooCommerce, reintentando');
      await esperar(calcularEspera(intento, null));
      continue;
    }

    if (esReintentable(res.status) && intento <= REINTENTOS_MAXIMOS) {
      logger.warn(
        { recurso, intento, status: res.status },
        'WooCommerce respondió con error reintentable',
      );
      await esperar(calcularEspera(intento, res.headers.get('retry-after')));
      continue;
    }

    if (!res.ok) {
      // Nunca el cuerpo: puede traer datos de negocio o personales.
      throw new ErrorWooCommerce(
        recurso,
        res.status,
        `WooCommerce respondió ${res.status} en "${recurso}"`,
      );
    }

    return res;
  }

  /* istanbul ignore next -- el for siempre retorna o lanza antes de esto */
  throw new ErrorWooCommerce(recurso, null, `No se pudo completar la petición a "${recurso}"`);
}

async function leerJson<T>(recurso: string, res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new ErrorWooCommerce(
      recurso,
      res.status,
      `Respuesta de WooCommerce en "${recurso}" no es JSON válido (posible bloqueo de WAF/Cloudflare)`,
    );
  }
}

interface PaginaResultado<T> {
  datos: T[];
  totalPaginas: number | null;
}

async function obtenerPagina<T>(
  recurso: string,
  params: Record<string, string>,
  pagina: number,
): Promise<PaginaResultado<T>> {
  const res = await peticionGet(recurso, { ...params, page: String(pagina) });
  const datos = await leerJson<T[]>(recurso, res);

  if (!Array.isArray(datos)) {
    throw new ErrorWooCommerce(
      recurso,
      res.status,
      `Respuesta de WooCommerce en "${recurso}" no es una lista`,
    );
  }

  const cabeceraPaginas = res.headers.get('x-wp-totalpages');
  return {
    datos,
    totalPaginas: cabeceraPaginas !== null ? Number(cabeceraPaginas) : null,
  };
}

/** Pagina por X-WP-TotalPages (regla obligatoria) — nunca "hasta que venga vacío". */
async function listarTodo<T>(recurso: string, params: Record<string, string>): Promise<T[]> {
  const todo: T[] = [];
  let pagina = 1;

  while (true) {
    const { datos, totalPaginas } = await obtenerPagina<T>(recurso, params, pagina);
    todo.push(...datos);

    // Log de progreso EN CADA página, no sólo al final: una carga inicial
    // sin acotar puede traer miles de registros y tardar varios minutos —
    // sin esto no hay forma de distinguir "está trabajando" de "se colgó".
    logger.info(
      { recurso, pagina, totalPaginas, itemsAcumulados: todo.length },
      'Progreso de paginación de WooCommerce',
    );

    if (datos.length === 0) break;
    if (totalPaginas !== null) {
      if (pagina >= totalPaginas) break;
    } else if (datos.length < PER_PAGE) {
      break;
    }
    pagina++;
  }

  // Cantidad, nunca contenido — los pedidos traen nombres, emails, teléfonos,
  // direcciones y NIF de clientes reales (requisito RGPD, no preferencia).
  logger.info({ recurso, total: todo.length }, 'Recurso de WooCommerce listado completo');
  return todo;
}

export interface ParametrosListado {
  /** date_modified_gmt >= este valor (ISO 8601). Funciona en /orders y /products (verificado). */
  modifiedAfter?: string;
}

function paramsOpcionales(params: ParametrosListado): Record<string, string> {
  return params.modifiedAfter ? { modified_after: params.modifiedAfter } : {};
}

export async function listarPedidos(params: ParametrosListado = {}): Promise<WooOrder[]> {
  return listarTodo<WooOrder>('orders', {
    status: 'any', // captura cancelaciones — no lo puede pisar el llamador
    ...paramsOpcionales(params),
  });
}

/** GET /orders/{id} — usado por el webhook (ADR-002): notificación → estado canónico. */
export async function obtenerPedido(wooOrderId: number): Promise<WooOrder> {
  const res = await peticionGet(`orders/${wooOrderId}`, {});
  const pedido = await leerJson<WooOrder>('orders', res);
  logger.info({ wooOrderId }, 'Pedido obtenido de WooCommerce');
  return pedido;
}

export async function listarProductos(params: ParametrosListado = {}): Promise<WooProduct[]> {
  return listarTodo<WooProduct>('products', paramsOpcionales(params));
}

export async function listarVariaciones(wooProductId: number): Promise<WooProductVariation[]> {
  return listarTodo<WooProductVariation>(`products/${wooProductId}/variations`, {});
}
