/**
 * Disparo manual de la ingesta. Todavía NO está conectado a ningún endpoint
 * HTTP — eso es de la capa de servidor (el futuro `/tasques/sync-*`, ver
 * ADR-009). Por ahora, invocable desde acá o importando directamente
 * `ingerirComandes`/`ingerirCataleg` de `src/sync/ingesta.ts`.
 *
 * Uso: tsx src/scripts/ingerir.ts [comandes|cataleg|tots]  (default: tots)
 */
import { cerrarPool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { ingerirCataleg, ingerirComandes } from '../sync/ingesta.js';

const recurs = process.argv[2] ?? 'tots';

async function main(): Promise<void> {
  if (recurs === 'comandes') {
    console.log(await ingerirComandes());
  } else if (recurs === 'cataleg') {
    console.log(await ingerirCataleg());
  } else if (recurs === 'tots') {
    const [comandes, cataleg] = await Promise.all([ingerirComandes(), ingerirCataleg()]);
    console.log({ comandes, cataleg });
  } else {
    console.error(`Recurso desconocido: "${recurs}". Usar: comandes | cataleg | tots`);
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'La ingesta manual falló');
    process.exitCode = 1;
  })
  .finally(() => cerrarPool());
