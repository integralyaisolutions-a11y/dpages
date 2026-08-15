import { describe, expect, it } from 'vitest';
import { ErrorConfiguracion, parsearEnv } from './env.js';

const entornoValido = {
  DATABASE_URL: 'postgres://dpages:dpages@localhost:5433/dpages',
  WC_BASE_URL: 'https://dpages.cat',
  WC_CONSUMER_KEY: 'ck_test',
  WC_CONSUMER_SECRET: 'cs_test',
  WEBHOOK_SECRET: 'wh_test',
  TASQUES_SECRET: 'tasques_test',
};

describe('parsearEnv', () => {
  it('acepta una configuración mínima y aplica los defaults', () => {
    const env = parsearEnv(entornoValido);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(8080);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DB_POOL_MAX).toBe(5);
  });

  it('acepta la forma de Cloud SQL de DATABASE_URL (socket unix, sin host)', () => {
    const env = parsearEnv({
      ...entornoValido,
      DATABASE_URL: 'postgresql://dpages:secret@/dpages?host=/cloudsql/proj:region:instance',
    });

    expect(env.DATABASE_URL).toContain('/cloudsql/');
  });

  it('coacciona PORT y DB_POOL_MAX desde string a número', () => {
    const env = parsearEnv({ ...entornoValido, PORT: '3000', DB_POOL_MAX: '3' });

    expect(env.PORT).toBe(3000);
    expect(env.DB_POOL_MAX).toBe(3);
  });

  it('falla si falta DATABASE_URL, y el mensaje dice qué variable falta', () => {
    const { DATABASE_URL: _omitida, ...sinDatabaseUrl } = entornoValido;
    expect(() => parsearEnv(sinDatabaseUrl)).toThrow(ErrorConfiguracion);
    expect(() => parsearEnv(sinDatabaseUrl)).toThrow(/DATABASE_URL/);
  });

  it('falla si DATABASE_URL no tiene forma de cadena de conexión de Postgres', () => {
    expect(() =>
      parsearEnv({ ...entornoValido, DATABASE_URL: 'no-es-una-url-de-postgres' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('falla si NODE_ENV trae un valor fuera de la lista permitida', () => {
    expect(() => parsearEnv({ ...entornoValido, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('falla si falta alguna variable de WooCommerce', () => {
    const { WC_CONSUMER_KEY: _omitida, ...sinConsumerKey } = entornoValido;
    expect(() => parsearEnv(sinConsumerKey)).toThrow(/WC_CONSUMER_KEY/);
  });

  it('falla si WC_BASE_URL no es una URL válida', () => {
    expect(() => parsearEnv({ ...entornoValido, WC_BASE_URL: 'dpages.cat' })).toThrow(
      /WC_BASE_URL/,
    );
  });

  it('falla si falta WEBHOOK_SECRET o TASQUES_SECRET', () => {
    const { WEBHOOK_SECRET: _a, ...sinWebhookSecret } = entornoValido;
    expect(() => parsearEnv(sinWebhookSecret)).toThrow(/WEBHOOK_SECRET/);

    const { TASQUES_SECRET: _b, ...sinTasquesSecret } = entornoValido;
    expect(() => parsearEnv(sinTasquesSecret)).toThrow(/TASQUES_SECRET/);
  });

  it('TASQUES_OIDC_AUDIENCE es opcional, pero tiene que ser una URL válida si viene', () => {
    const sinAudiencia = parsearEnv(entornoValido);
    expect(sinAudiencia.TASQUES_OIDC_AUDIENCE).toBeUndefined();

    expect(() => parsearEnv({ ...entornoValido, TASQUES_OIDC_AUDIENCE: 'no-es-url' })).toThrow(
      /TASQUES_OIDC_AUDIENCE/,
    );

    const conAudiencia = parsearEnv({
      ...entornoValido,
      TASQUES_OIDC_AUDIENCE: 'https://backend-xyz.run.app/tasques/sync-comandes',
    });
    expect(conAudiencia.TASQUES_OIDC_AUDIENCE).toBe(
      'https://backend-xyz.run.app/tasques/sync-comandes',
    );
  });
});
