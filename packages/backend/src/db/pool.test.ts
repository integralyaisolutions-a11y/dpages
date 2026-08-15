import { describe, expect, it } from 'vitest';
import { cerrarPool, pool } from './pool.js';

describe('pool de Postgres', () => {
  it('respeta el máximo de conexiones configurado (Cloud Run: pools chicos)', () => {
    expect(pool.options.max).toBe(5);
  });

  it('el handler de error del pool no relanza (una conexión inactiva que muere es normal)', () => {
    expect(() => pool.emit('error', new Error('conexión inactiva terminada'))).not.toThrow();
  });

  it('cerrarPool() no lanza y es seguro llamarla más de una vez', async () => {
    await expect(cerrarPool()).resolves.toBeUndefined();
    await expect(cerrarPool()).resolves.toBeUndefined();
  });
});
