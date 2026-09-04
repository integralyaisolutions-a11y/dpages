/**
 * Capa 51, Parte 2 — de un solo uso. Reset COMPLETO de pedidos y catálogo
 * (fase pre-productiva, ADR-007 permite esto — ver la nota fechada dentro
 * de esa ADR en decisiones-arquitectura.md). Paso previo a reconstruir todo
 * desde cero con `carga-completa-cataleg.ts`.
 *
 * `reset-carga-inicial.ts` NO sirve para esto (auditado, capa 51 parte 2):
 * su lógica PROTEGE cualquier producte/client/tarifa que ya tenga un
 * pedido real apuntándole — exactamente lo opuesto de lo que hace falta
 * acá. Tampoco toca `comanda`/`comanda_linia` en absoluto. Por eso este es
 * un script nuevo, no una reutilización — borra TODO, sin protección,
 * pedidos incluidos.
 *
 * QUÉ SE BORRA (orden por FK — ver migraciones 0001/0002/0003/0005/0006/
 * 0008/0012, todas revisadas):
 *   1. incidencia_comanda  — FK comanda_id → comanda (ON DELETE CASCADE,
 *      se borra explícito igual, no depender del cascade a ciegas).
 *   2. comanda_linia       — FK comanda_id → comanda (CASCADE); FK
 *      producte_id → producte y alias_producte_id → alias_producte
 *      (ninguna de las dos con CASCADE) — por eso tiene que ir ANTES que
 *      producte/alias_producte.
 *   3. comanda
 *   4. alias_producte      — FK producte_id → producte.
 *   5. rendiments_porcs    — FK producte_id → producte.
 *   6. tarifa_preu         — FK producte_id → producte (NOT NULL: TODA
 *      fila de tarifa_preu referencia un producte, no hay filas "mixtas"
 *      que sobrevivan). También tiene FK a tarifa, que NO se borra — no
 *      hace falta: sólo se eliminan las filas de tarifa_preu, no tarifa.
 *   7. producte            — FK categoria_id → categoria_producte
 *      (nullable, pero igual va antes).
 *   8. categoria_producte
 *   9. incidencia_cataleg  — SIN FK real (woo_product_id es un BIGINT
 *      plano, no REFERENCES nada) — el orden respecto a las demás no
 *      importa, confirmado por Gerardo que se limpia igual.
 *
 * QUÉ NO SE TOCA (auditado, capa 51 parte 2):
 *   - client, tarifa, transportista, usuari, rol, origen_comanda — nada.
 *   - aterratge_woocommerce — el crudo histórico; carga-completa-cataleg.ts
 *     lo reusa (upsert idempotente), no hace falta re-descargar de
 *     WooCommerce lo que ya está aterrizado.
 *   - esdeveniment_webhook — auditado (migración 0001): `woo_order_id` es
 *     un BIGINT SIN foreign key real hacia `comanda`, sólo un índice. Es
 *     un log de auditoría de webhooks recibidos, desacoplado a propósito
 *     de `comanda` (ADR-002: "el webhook es una notificación, no la
 *     fuente del dato"). `registrarEsdeveniment` siempre hace INSERT sin
 *     depender de que la comanda exista — dejar filas viejas ahí no rompe
 *     nada ni bloquea el reprocesamiento de webhooks futuros.
 *
 * DIFERENCIA con el chequeo de integridad de reset-carga-inicial.ts: esa
 * función (`comprovarIntegritatPostEsborrat`) comprueba orfandad SELECTIVA
 * porque ese script protege una parte de los datos y borra otra — tiene
 * sentido verificar que lo protegido no quedó con una referencia rota. Acá
 * NO hay nada que proteger: se borran las 9 tablas enteras, sin excepción
 * — esa función no aplica tal cual (no se reescribió nada de más, se
 * comprobó que directamente no calza con este caso). El chequeo que sí
 * tiene sentido acá es más simple: confirmar que las 9 tablas quedaron en
 * 0 filas — si alguna no, algo se escapó del plan y no se confirma el COMMIT.
 *
 * DESTRUCTIVO — pide confirmación explícita (escribir "CONFIRMAR"),
 * sólo cuando se invoca con --aplicar. Sin ese flag es dry-run puro: sólo
 * cuenta e informa, nunca pregunta nada ni escribe nada.
 *
 * Uso:
 *   tsx --env-file-if-exists=../../.env src/scripts/reset-comandes-i-cataleg.ts
 *   tsx --env-file-if-exists=../../.env src/scripts/reset-comandes-i-cataleg.ts --aplicar [--permitir-produccio]
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { DatabaseError } from 'pg';
import type { Pool, PoolClient } from 'pg';
import { env } from '../config/env.js';
import { cerrarPool, pool as poolPerDefecte } from '../db/pool.js';
import { logger } from '../lib/logger.js';

/** Orden real de borrado — ver el comentario de cabecera para el porqué de cada paso. */
const TAULES_A_ESBORRAR = [
  'incidencia_comanda',
  'comanda_linia',
  'comanda',
  'alias_producte',
  'rendiments_porcs',
  'tarifa_preu',
  'producte',
  'categoria_producte',
  'incidencia_cataleg',
] as const;

type Taula = (typeof TAULES_A_ESBORRAR)[number];

export type Recompte = Record<Taula, number>;

async function confirmarPerConsola(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const resposta = await rl.question('Escriu CONFIRMAR per continuar: ');
    return resposta.trim() === 'CONFIRMAR';
  } finally {
    rl.close();
  }
}

/** Cuántas filas hay HOY en cada tabla — lo usan tanto el dry-run como el informe final post-borrado. */
export async function comptarFiles(db: Pool | PoolClient): Promise<Recompte> {
  const recompte = {} as Recompte;
  for (const taula of TAULES_A_ESBORRAR) {
    // `taula` nunca viene de una petición — son los 9 literales fijos de
    // arriba, mismo criterio que resolverUuid en rutes/api/comu.ts.
    const res = await db.query<{ count: string }>(`SELECT count(*) FROM ${taula}`);
    recompte[taula] = Number(res.rows[0]!.count);
  }
  return recompte;
}

/**
 * Ejecuta el borrado real (una sola transacción, orden documentado en la
 * cabecera). Separada del resto para que el test pueda invocarla directo,
 * sin pasar por `readline`.
 */
export async function esborrarTot(dbPool: Pool): Promise<Recompte> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    try {
      const recompte = {} as Recompte;
      for (const taula of TAULES_A_ESBORRAR) {
        const res = await client.query(`DELETE FROM ${taula}`);
        recompte[taula] = res.rowCount ?? 0;
      }

      // Chequeo de integridad post-borrado — ver la nota de cabecera sobre
      // por qué NO es comprovarIntegritatPostEsborrat (esa función
      // comprueba orfandad selectiva; acá no hay nada que proteger, así
      // que el chequeo que corresponde es "las 9 tablas quedaron en 0").
      const restant = await comptarFiles(client);
      const noBuides = TAULES_A_ESBORRAR.filter((t) => restant[t] > 0);
      if (noBuides.length > 0) {
        throw new Error(
          `Comprovació d'integritat post-esborrat FALLIDA: les taules ${noBuides.join(', ')} ` +
            'no van quedar buides. No es va confirmar res (ROLLBACK) — revisa si hi ha alguna ' +
            'fila que es va tornar a inserir durant el propi DELETE (trigger no previst, etc.).',
        );
      }

      await client.query('COMMIT');
      return recompte;
    } catch (err) {
      await client.query('ROLLBACK');
      // FK RESTRICT no anticipada — mismo criterio que reset-carga-inicial.ts:
      // se re-lanza con contexto en vez de un error crudo de pg.
      if (err instanceof DatabaseError && err.code === '23503') {
        throw new Error(
          `No es va poder esborrar per una referència (FK) no prevista: ${err.detail ?? err.message}. ` +
            "Revisa el comentari de cabecera d'aquest script (FK conegudes) i afegeix la que falti.",
          { cause: err },
        );
      }
      throw err;
    }
  } finally {
    client.release();
  }
}

export type ResultatReset =
  | { feta: false; motiu: 'res_per_esborrar' | 'dry_run' | 'cancellat'; abans: Recompte }
  | { feta: true; abans: Recompte; recompte: Recompte };

/**
 * Punto de entrada de la lógica completa (conteo → dry-run/confirmación →
 * borrado), inyectando `confirmar` para poder saltarla en tests. No
 * imprime nada por consola — eso lo hace `main()`.
 */
export async function resetComandesICataleg(
  dbPool: Pool,
  aplicar: boolean,
  confirmar: () => Promise<boolean> = confirmarPerConsola,
): Promise<ResultatReset> {
  const abans = await comptarFiles(dbPool);
  const totalAEsborrar = Object.values(abans).reduce((acc, n) => acc + n, 0);

  if (totalAEsborrar === 0) {
    return { feta: false, motiu: 'res_per_esborrar', abans };
  }
  if (!aplicar) {
    return { feta: false, motiu: 'dry_run', abans };
  }
  if (!(await confirmar())) {
    return { feta: false, motiu: 'cancellat', abans };
  }

  const recompte = await esborrarTot(dbPool);
  return { feta: true, abans, recompte };
}

async function main(): Promise<void> {
  // Mismo criterio que reset-carga-inicial.ts.
  if (env.NODE_ENV === 'production' && !process.argv.includes('--permitir-produccio')) {
    throw new Error(
      'Aquest script és destructiu i NODE_ENV=production — rebutjat. Si de veritat voleu ' +
        'esborrar comandes i catàleg complet contra producció, passeu --permitir-produccio ' +
        'explícitament.',
    );
  }

  const aplicar = process.argv.includes('--aplicar');
  const resultat = await resetComandesICataleg(poolPerDefecte, aplicar);

  console.log('Files actuals per taula:');
  for (const taula of TAULES_A_ESBORRAR) {
    console.log(`  ${taula}: ${resultat.abans[taula]}`);
  }

  if (!resultat.feta) {
    const missatges = {
      res_per_esborrar: '\nRes per esborrar — totes les taules ja estan buides.',
      dry_run:
        '\nMode DRY-RUN (default) — no es va escriure res. Correr amb --aplicar per esborrar de veritat.',
      cancellat: '\nCancel·lat — no es va esborrar res.',
    };
    console.log(missatges[resultat.motiu]);
    return;
  }

  console.log('\nEsborrat complet. Files esborrades per taula:');
  for (const taula of TAULES_A_ESBORRAR) {
    console.log(`  ${taula}: ${resultat.recompte[taula]}`);
  }
}

const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  main()
    .catch((err: unknown) => {
      logger.error(
        { err },
        'El reset de comandes i catàleg va fallar — res es va esborrar (ROLLBACK)',
      );
      process.exitCode = 1;
    })
    .finally(() => cerrarPool());
}
