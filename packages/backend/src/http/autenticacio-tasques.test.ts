import { describe, expect, it, vi } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { autenticarTasca, secretValid } from './autenticacio-tasques.js';

describe('secretValid', () => {
  it('acepta cuando coincide', () => {
    expect(secretValid('el-secreto', 'el-secreto')).toBe(true);
  });

  it('rechaza cuando no coincide', () => {
    expect(secretValid('otro', 'el-secreto')).toBe(false);
  });

  it('rechaza undefined', () => {
    expect(secretValid(undefined, 'el-secreto')).toBe(false);
  });

  it('rechaza cadena vacía', () => {
    expect(secretValid('', 'el-secreto')).toBe(false);
  });
});

describe('autenticarTasca — fuera de producción: secreto compartido', () => {
  it('acepta el secreto correcto vía Bearer', async () => {
    const ok = await autenticarTasca(`Bearer ${env.TASQUES_SECRET}`, 'development');
    expect(ok).toBe(true);
  });

  it('rechaza un secreto incorrecto', async () => {
    const ok = await autenticarTasca('Bearer secreto-incorrecto', 'development');
    expect(ok).toBe(false);
  });

  it('rechaza si falta la cabecera Authorization', async () => {
    const ok = await autenticarTasca(undefined, 'development');
    expect(ok).toBe(false);
  });

  it('rechaza si falta el prefijo "Bearer "', async () => {
    const ok = await autenticarTasca(env.TASQUES_SECRET, 'development');
    expect(ok).toBe(false);
  });
});

describe('autenticarTasca — producción: OIDC (jose mockeado, sin red real)', () => {
  const audienciaTest = 'https://backend-xyz.run.app/tasques/sync-comandes';

  it('acepta un token cuya verificación OIDC resuelve bien', async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({} as never);
    const ok = await autenticarTasca(
      'Bearer token-de-cloud-scheduler',
      'production',
      audienciaTest,
    );
    expect(ok).toBe(true);
  });

  it('rechaza si jwtVerify lanza (firma, emisor o audiencia inválidos)', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('signature verification failed'));
    const ok = await autenticarTasca('Bearer token-falso', 'production', audienciaTest);
    expect(ok).toBe(false);
  });

  it('rechaza si falta el prefijo Bearer, sin llegar a llamar a jwtVerify', async () => {
    vi.mocked(jwtVerify).mockClear();
    const ok = await autenticarTasca('token-sin-bearer', 'production', audienciaTest);
    expect(ok).toBe(false);
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it('rechaza toda tarea si TASQUES_OIDC_AUDIENCE no está configurado, sin llegar a llamar a jwtVerify', async () => {
    vi.mocked(jwtVerify).mockClear();
    const ok = await autenticarTasca('Bearer token-cualquiera', 'production', undefined);
    expect(ok).toBe(false);
    expect(jwtVerify).not.toHaveBeenCalled();
  });
});
