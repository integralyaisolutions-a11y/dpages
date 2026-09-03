import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Capa 49bis — archivo separado a propósito: necesita mockear `undici`
 * ANTES de importar cliente.ts (que llama a `setGlobalDispatcher` como
 * efecto de módulo, una sola vez al cargarse). Mezclar esto con
 * cliente.test.ts (que importa `cliente.js` de forma ESTÁTICA arriba de
 * todo, y ya tiene su propio mock de `fetch` global) arriesgaría
 * interacciones raras entre `vi.resetModules()` y esos bindings estáticos
 * — más simple y más seguro en su propio archivo.
 */
describe('cliente.ts — configura connectTimeout de undici al cargarse (capa 49bis/49ter)', () => {
  afterEach(() => {
    vi.doUnmock('undici');
    vi.resetModules();
  });

  it('llama a setGlobalDispatcher con un Agent cuyo connectTimeout = TIMEOUT_CONEXIO_MS (15_000), NO el mismo valor que TIMEOUT_PETICION_MS', async () => {
    const setGlobalDispatcherMock = vi.fn<(dispatcher: unknown) => void>();
    class AgentFake {
      readonly opciones: unknown;
      constructor(opciones: unknown) {
        this.opciones = opciones;
      }
    }

    vi.resetModules();
    vi.doMock('undici', () => ({
      Agent: AgentFake,
      setGlobalDispatcher: setGlobalDispatcherMock,
    }));

    await import('./cliente.js');

    // El diagnóstico real (ver docs/hallazgos-woocommerce.md, capa 49bis):
    // AbortSignal.timeout() NO controla la fase de conexión — undici tiene
    // su propio connectTimeout (default 10_000ms), independiente. Capa
    // 49ter: usar el MISMO valor que TIMEOUT_PETICION_MS (como hacía la
    // 49bis) rompía el diagnóstico — acá se confirma que quedó un valor
    // PROPIO y distinto (15_000, menor que los 30_000 de la petición
    // completa), no el mismo número reciclado.
    expect(setGlobalDispatcherMock).toHaveBeenCalledTimes(1);
    const dispatcher = setGlobalDispatcherMock.mock.calls[0]?.[0];
    expect(dispatcher).toBeInstanceOf(AgentFake);
    expect((dispatcher as InstanceType<typeof AgentFake>).opciones).toEqual({
      connectTimeout: 15_000,
    });
  });
});
