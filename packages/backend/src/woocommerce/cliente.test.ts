import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WooOrder, WooProduct } from '@dpages/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../lib/logger.js';
import { ErrorWooCommerce, listarPedidos, listarProductos, obtenerPedido } from './cliente.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function leerFixture<T>(nombre: string): T {
  const ruta = path.join(__dirname, '../__fixtures__', nombre);
  return JSON.parse(readFileSync(ruta, 'utf8')) as T;
}

const comandaSimple = leerFixture<WooOrder>('comanda-simple.json');
const producteCa = leerFixture<WooProduct>('producte-ca.json');

function respuestaJson(
  cuerpo: unknown,
  opciones: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: opciones.status ?? 200,
    headers: { 'content-type': 'application/json', ...opciones.headers },
  });
}

function respuestaPagina(items: unknown[], totalPaginas: number): Response {
  return respuestaJson(items, { headers: { 'x-wp-totalpages': String(totalPaginas) } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function urlDeLaLlamada(indice = 0): URL {
  const llamada = fetchMock.mock.calls[indice];
  if (!llamada) throw new Error(`No hubo llamada Nº ${indice} a fetch`);
  return llamada[0] as URL;
}

describe('parámetros obligatorios', () => {
  it('van en toda petición, y el llamador no los puede pisar', async () => {
    fetchMock.mockResolvedValueOnce(respuestaPagina([producteCa], 1));

    await listarProductos();

    const url = urlDeLaLlamada();
    expect(url.searchParams.get('dates_are_gmt')).toBe('true');
    expect(url.searchParams.get('orderby')).toBe('modified');
    expect(url.searchParams.get('order')).toBe('asc');
    expect(url.searchParams.get('per_page')).toBe('100');
  });

  it('listarPedidos siempre manda status=any, sin que se pueda evitar', async () => {
    fetchMock.mockResolvedValueOnce(respuestaPagina([comandaSimple], 1));

    await listarPedidos();

    expect(urlDeLaLlamada().searchParams.get('status')).toBe('any');
  });

  it('modified_after se aplica tanto a /orders como a /products', async () => {
    fetchMock
      .mockResolvedValueOnce(respuestaPagina([comandaSimple], 1))
      .mockResolvedValueOnce(respuestaPagina([producteCa], 1));

    await listarPedidos({ modifiedAfter: '2026-08-01T00:00:00' });
    await listarProductos({ modifiedAfter: '2026-08-01T00:00:00' });

    expect(urlDeLaLlamada(0).searchParams.get('modified_after')).toBe('2026-08-01T00:00:00');
    expect(urlDeLaLlamada(1).searchParams.get('modified_after')).toBe('2026-08-01T00:00:00');
  });

  it('usa /wp-json/wc/v3/, nunca la API legacy', async () => {
    fetchMock.mockResolvedValueOnce(respuestaPagina([producteCa], 1));
    await listarProductos();
    expect(urlDeLaLlamada().pathname).toContain('/wp-json/wc/v3/');
  });
});

describe('paginación', () => {
  it('recorre todas las páginas leyendo X-WP-TotalPages', async () => {
    fetchMock
      .mockResolvedValueOnce(respuestaPagina([producteCa], 3))
      .mockResolvedValueOnce(respuestaPagina([producteCa], 3))
      .mockResolvedValueOnce(respuestaPagina([producteCa], 3));

    const productos = await listarProductos();

    expect(productos).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlDeLaLlamada(0).searchParams.get('page')).toBe('1');
    expect(urlDeLaLlamada(1).searchParams.get('page')).toBe('2');
    expect(urlDeLaLlamada(2).searchParams.get('page')).toBe('3');
  });

  it('se detiene si una página viene vacía, sin importar la cabecera', async () => {
    fetchMock.mockResolvedValueOnce(respuestaPagina([], 5));

    const productos = await listarProductos();

    expect(productos).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loguea progreso en CADA página, no sólo al final — para no parecer colgado en una carga larga', async () => {
    const espia = vi.spyOn(logger, 'info');
    fetchMock
      .mockResolvedValueOnce(respuestaPagina([producteCa], 3))
      .mockResolvedValueOnce(respuestaPagina([producteCa], 3))
      .mockResolvedValueOnce(respuestaPagina([producteCa], 3));

    await listarProductos();

    const logsDeProgreso = espia.mock.calls.filter(
      (llamada) => llamada[1] === 'Progreso de paginación de WooCommerce',
    );
    expect(logsDeProgreso).toHaveLength(3);
    expect(logsDeProgreso[0]?.[0]).toMatchObject({
      pagina: 1,
      totalPaginas: 3,
      itemsAcumulados: 1,
    });
    expect(logsDeProgreso[2]?.[0]).toMatchObject({
      pagina: 3,
      totalPaginas: 3,
      itemsAcumulados: 3,
    });

    espia.mockRestore();
  });
});

describe('reintentos', () => {
  it('reintenta ante 429 y termina trayendo los datos', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(respuestaPagina([producteCa], 1));

    const productos = await listarProductos();

    expect(productos).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reintenta ante 503 (5xx)', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(respuestaPagina([producteCa], 1));

    await listarProductos();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no reintenta ante un 404 — falla directo', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(obtenerPedido(999999)).rejects.toThrow(ErrorWooCommerce);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('si el 429 persiste, agota los reintentos y lanza sin volcar el cuerpo', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"cliente": "dato sensible que nunca debería aparecer en el error"}', {
        status: 429,
        headers: { 'retry-after': '0' },
      }),
    );

    let error: unknown;
    try {
      await listarProductos();
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ErrorWooCommerce);
    const errorWoo = error as ErrorWooCommerce;
    expect(errorWoo.recurso).toBe('products');
    expect(errorWoo.status).toBe(429);
    expect(errorWoo.message).not.toContain('dato sensible');
    // 1 intento inicial + REINTENTOS_MAXIMOS reintentos
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe('obtenerPedido', () => {
  it('trae un pedido puntual por id, sin paginar', async () => {
    fetchMock.mockResolvedValueOnce(respuestaJson(comandaSimple));

    const pedido = await obtenerPedido(comandaSimple.id);

    expect(pedido.id).toBe(comandaSimple.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlDeLaLlamada().pathname).toContain(`orders/${comandaSimple.id}`);
  });
});

describe('capa 41 — credenciales por query string, nunca por header Authorization', () => {
  it('manda consumer_key/consumer_secret en el query string, y NO manda header Authorization', async () => {
    fetchMock.mockResolvedValueOnce(respuestaPagina([producteCa], 1));

    await listarProductos();

    const url = urlDeLaLlamada();
    // env de test (vitest.config.ts): WC_CONSUMER_KEY='ck_test', WC_CONSUMER_SECRET='cs_test'.
    expect(url.searchParams.get('consumer_key')).toBe('ck_test');
    expect(url.searchParams.get('consumer_secret')).toBe('cs_test');

    const opciones = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(opciones?.headers);
    expect(headers.has('authorization')).toBe(false);
  });

  it('si falla el fetch y el error trae la URL completa, el mensaje final NO contiene las credenciales en texto plano', async () => {
    // Node/undici arma sus propios mensajes de error — no controlamos el
    // texto exacto, así que simulamos el peor caso: un error de fetch
    // cuyo mensaje incluye la URL completa (con credenciales), tal como
    // podría pasar con ciertos fallos de red/TLS. Un fallo de red (a
    // diferencia de un 429 con retry-after) espera con backoff real
    // (500ms, 1s, 2s, 4s, 8s) — de ahí el timeout largo de este test,
    // no hay retry-after que lo acorte.
    const urlConCredenciales =
      'https://dpages.cat/wp-json/wc/v3/products?consumer_key=ck_test&consumer_secret=cs_test&per_page=100';
    fetchMock.mockRejectedValue(new TypeError(`fetch failed: ${urlConCredenciales}`));

    let error: unknown;
    try {
      await listarProductos();
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ErrorWooCommerce);
    const errorWoo = error as ErrorWooCommerce;
    expect(errorWoo.message).not.toContain('ck_test');
    expect(errorWoo.message).not.toContain('cs_test');
    expect(errorWoo.message).not.toContain('consumer_key');
    expect(errorWoo.message).toContain('products'); // el resto del diagnóstico se conserva
  }, 20_000);

  it('los logs de reintento nunca incluyen la URL — sólo recurso/intento/status', async () => {
    const espia = vi.spyOn(logger, 'warn');
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(respuestaPagina([producteCa], 1));

    await listarProductos();

    for (const llamada of espia.mock.calls) {
      const texto = JSON.stringify(llamada);
      expect(texto).not.toContain('ck_test');
      expect(texto).not.toContain('cs_test');
      expect(texto).not.toContain('consumer_key');
    }

    espia.mockRestore();
  });
});

describe('respuestas no-JSON (WAF/Cloudflare)', () => {
  it('lanza un error claro en vez de propagar el error de parseo', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Attention Required! | Cloudflare</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(listarProductos()).rejects.toThrow(/no es JSON válido/);
  });
});
