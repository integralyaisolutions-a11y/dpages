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
      // Explícito, no confiar en el default de Vitest: autenticacio-tasques.ts
      // sólo toma el camino de secreto compartido (nunca el de OIDC/red real)
      // cuando NODE_ENV !== 'production'.
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://dpages:dpages@localhost:5434/dpages_test',
      // Dummies: los tests del cliente de WooCommerce interceptan fetch, así
      // que nunca salen a la red de verdad con estos valores (ver requisito
      // "ningún test debe pegarle a dpages.cat"). .invalid es un TLD
      // reservado por la IANA justamente para esto, para que sea imposible
      // que resuelva a un dominio real si algún test se olvida de mockear.
      WC_BASE_URL: 'https://woocommerce-test.invalid',
      WC_CONSUMER_KEY: 'ck_test',
      WC_CONSUMER_SECRET: 'cs_test',
      WEBHOOK_SECRET: 'webhook_secret_test',
      TASQUES_SECRET: 'tasques_secret_test',
      // NODE_ENV=test nunca es 'production' (ver config/env.ts), así que
      // esto es válido acá — los tests de rutas de negocio (capa 8) no
      // necesitan un token en cada petición. auth-firebase.test.ts anula
      // esta variable en su propio archivo para probar el camino real.
      AUTH_DISABLED: 'true',
    },
  },
});
