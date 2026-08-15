import { z } from 'zod';

/**
 * DATABASE_URL tiene que aceptar tanto la cadena de Docker local
 * (postgres://usuario:pass@localhost:5433/dpages) como la de Cloud SQL, que
 * usa un socket unix vía query string y no siempre trae host entre "@" y "/"
 * (postgresql://usuario:pass@/dpages?host=/cloudsql/proyecto:region:instancia).
 * Por eso se valida como cadena con el prefijo correcto, no con z.string().url()
 * (el parser WHATWG de URL rechaza la forma de Cloud SQL por tener host vacío).
 */
const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z
    .string({ required_error: 'falta esta variable de entorno' })
    .min(1, 'no puede estar vacía')
    .regex(/^postgres(ql)?:\/\//, 'debe empezar con postgres:// o postgresql://'),
  // Cloud Run escala instancias y cada una abre su propio pool; Cloud SQL en
  // instancias chicas tiene pocas conexiones disponibles. Techo bajo a propósito.
  DB_POOL_MAX: z.coerce.number().int().positive().max(20).default(5),
});

export type Env = z.infer<typeof esquemaEnv>;

export class ErrorConfiguracion extends Error {}

/**
 * Función pura, sin efectos: separada de `env` para poder testear los casos
 * de error sin pasar por process.exit(). El arranque real usa `env` (abajo).
 */
export function parsearEnv(entorno: Record<string, string | undefined>): Env {
  const resultado = esquemaEnv.safeParse(entorno);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((issue) => {
        const variable = issue.path.join('.') || '(variable desconocida)';
        return `  · ${variable}: ${issue.message}`;
      })
      .join('\n');

    throw new ErrorConfiguracion(
      `Configuración inválida — el proceso no puede arrancar:\n${detalle}\n\n` +
        'Revisá .env.example para ver qué variables hacen falta y con qué formato.',
    );
  }

  return resultado.data;
}

function inicializarEnv(): Env {
  try {
    return parsearEnv(process.env);
  } catch (err) {
    if (err instanceof ErrorConfiguracion) {
      // Fallar acá, en el arranque del módulo, es la parte importante: si
      // falta una variable el proceso no llega a levantar el servidor ni a
      // aceptar la primera petición.
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const env = inicializarEnv();
