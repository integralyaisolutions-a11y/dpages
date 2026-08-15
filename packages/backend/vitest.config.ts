import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // env.ts valida al importarse (falla al arrancar, no al primer uso) — sin
    // esto, cualquier test que importe algo que dependa de env.ts tira abajo
    // toda la corrida. No conecta de verdad: Pool() es lazy hasta la primera
    // consulta, así que alcanza con que la cadena tenga forma válida.
    env: {
      DATABASE_URL: 'postgres://dpages:dpages@localhost:5433/dpages_test',
    },
  },
});
