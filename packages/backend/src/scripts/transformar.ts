/**
 * Disparo manual de la transformación (catálogo → producte/alias_producte,
 * pedidos → comanda/comanda_linia). Todavía NO está conectado a ningún
 * endpoint HTTP — eso es de la capa de servidor. Corre después de la
 * ingesta (src/scripts/ingerir.ts), nunca antes: transforma lo que ya está
 * aterrizado en aterratge_woocommerce (ADR-003).
 *
 * Uso: tsx src/scripts/transformar.ts [cataleg|comandes|tots]  (default: tots)
 */
import { cerrarPool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { transformarCataleg } from '../transform/cataleg.js';
import { transformarComandes } from '../transform/comandes.js';

const recurs = process.argv[2] ?? 'tots';

async function main(): Promise<void> {
  if (recurs === 'cataleg') {
    console.log(await transformarCataleg());
  } else if (recurs === 'comandes') {
    console.log(await transformarComandes());
  } else if (recurs === 'tots') {
    // El catálogo primero: las líneas de pedido resuelven contra alias_producte.
    console.log({ cataleg: await transformarCataleg(), comandes: await transformarComandes() });
  } else {
    console.error(`Recurso desconocido: "${recurs}". Usar: cataleg | comandes | tots`);
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'La transformación manual falló');
    process.exitCode = 1;
  })
  .finally(() => cerrarPool());
