import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Apunta al Postgres de tests de docker-compose (servicio "postgres-test",
    // 5434, tmpfs — efímero). env.ts valida al importarse (falla al arrancar,
    // no al primer uso), así que hace falta una cadena válida para que
    // CUALQUIER test corra, no sólo los que tocan base. Los tests que
    // requieren una conexión real (runner de migraciones) usan esta base;
    // si no está levantada (`docker compose up -d postgres-test`), fallan
    // con un error de conexión claro, no en silencio.
    env: {
      DATABASE_URL: 'postgres://dpages:dpages@localhost:5434/dpages_test',
    },
  },
});
