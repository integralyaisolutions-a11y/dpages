/**
 * Vuelve a estado limpio lo que los tres importadores de carga-inicial/
 * pudieron haber creado (producte, tarifa, tarifa_preu, client, y sus
 * dependientes — ver "Orden de borrado" abajo) — pensado para correr antes
 * del cut-over real, una vez que la simulación con datos de ejemplo
 * (capa 18) ya cumplió su propósito de probar el mecanismo.
 *
 * No hay ninguna columna que marque "esta fila vino de un importador de
 * carga inicial" — el criterio de borrado es "todo lo que hay en estas
 * tablas, EXCEPTO lo que ya tiene un pedido real apuntándole" (ver abajo).
 * En un ambiente de desarrollo/simulación esto es exactamente lo que se
 * quiere: todo lo que hay ahí vino de estos importadores. Antes del
 * cut-over real, cualquier tarifa/producte/client que ya se haya usado en
 * un pedido real queda protegido automáticamente, no hace falta curarlo
 * a mano.
 *
 * DESTRUCTIVO — pide confirmación explícita (escribir "CONFIRMAR") antes
 * de borrar nada.
 *
 * A diferencia de netejar-historic-desenvolupament.ts, SÍ puede correr
 * contra producción, con el flag --permitir-produccio: la idea es usarlo
 * contra Cloud SQL real para limpiar los datos de PRUEBA de esta
 * simulación antes del cut-over de verdad (que si va a correr contra
 * producción, con los datos reales del cliente).
 *
 * QUÉ PROTEGE (repasadas las 15 migraciones, todas las FK hacia producte/
 * client/tarifa):
 *   - producte: protegido si algún comanda_linia.producte_id lo usa.
 *   - client: protegido si algún comanda.client_id lo usa.
 *   - tarifa: protegido si algún comanda.tarifa_id lo usa, O si algún
 *     client PROTEGIDO lo tiene asignado (client.tarifa_id) — un cliente
 *     real con una tarifa "de prueba" asignada hace que esa tarifa deje de
 *     ser sólo de prueba; no tiene sentido borrarla ni dejarla huérfana.
 *
 * Orden de borrado (por FK — ver también el comentario de cada paso):
 *   1. alias_producte — de los producte NO protegidos únicamente (un
 *      producte protegido puede tener sus propias filas de alias_producte;
 *      esas no se tocan, siguen perteneciendo a un producte que se
 *      conserva). Filas referenciadas por un comanda_linia.alias_producte_id
 *      real tampoco se tocan, aunque su producte_id no esté protegido —
 *      no debería pasar en un dato consistente, pero es una FK real
 *      (comanda_linia → alias_producte) y se respeta igual.
 *   2. rendiments_porcs — de los producte NO protegidos únicamente.
 *   3. tarifa_preu — de cualquier tarifa O producte que se vaya a borrar
 *      (si cualquiera de los dos lados no está protegido, el precio no
 *      puede sobrevivir sin dejar una referencia rota).
 *   4. client — los no protegidos. ANTES que tarifa: un client no
 *      protegido puede tener tarifa_id apuntando a una tarifa no
 *      protegida, y esa referencia tiene que desaparecer antes de poder
 *      borrar la tarifa.
 *   5. tarifa — las no protegidas (ya sin tarifa_preu ni client
 *      apuntándoles).
 *   6. producte — los no protegidos (ya sin alias_producte, rendiments_porcs
 *      ni tarifa_preu apuntándoles).
 *
 * Uso: tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/reset-carga-inicial.ts [--permitir-produccio]
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { DatabaseError } from 'pg';
import type { Pool, PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { cerrarPool, pool as poolPerDefecte } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';

const UUID_BUIT_ARRAY: string[] = [];

/** `ids` tal cual, o un placeholder si está vacío — `= ANY('{}')` funciona bien en Postgres, esto es sólo por claridad de intención. */
function oParaComparar(ids: string[]): string[] {
  return ids.length > 0 ? ids : UUID_BUIT_ARRAY;
}

async function confirmarPerConsola(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const resposta = await rl.question('Escriu CONFIRMAR per continuar: ');
    return resposta.trim() === 'CONFIRMAR';
  } finally {
    rl.close();
  }
}

interface ComprovacioOrfes {
  taula: string;
  columna: string;
  taulaReferenciada: string;
  orfes: number;
}

/**
 * Red de seguridad ADICIONAL a las protecciones ya construidas (no las
 * reemplaza) — cuenta referencias que quedarían colgando DESPUÉS del
 * borrado, antes de confirmar. En el esquema actual, comanda.client_id/
 * tarifa_id y comanda_linia.producte_id/alias_producte_id son FK con el
 * default de Postgres (NO ACTION/RESTRICT, no DEFERRABLE) — el propio
 * DELETE ya falla con un 23503 antes de poder dejar un huérfano así, así
 * que en teoría esto siempre da 0. Se deja como chequeo explícito por si
 * ese supuesto deja de ser cierto en el futuro (ej. alguien agrega
 * ON DELETE CASCADE/SET NULL a alguna de estas FK sin darse cuenta de que
 * cambia esta garantía), y como lección aprendida de un incidente real:
 * un reset corrido con la ingesta de pedidos todavía sin correr borró
 * 1229 clientes reales porque, en ESE momento, ningún comanda.client_id
 * los referenciaba todavía — la protección funcionó tal como está
 * diseñada, el problema fue el ORDEN de las operaciones entre dos scripts
 * distintos, algo que ningún chequeo dentro de una sola transacción puede
 * detectar. Este chequeo cubre lo que sí es detectable en una corrida.
 */
export async function comprovarIntegritatPostEsborrat(
  client: PoolClient,
): Promise<ComprovacioOrfes[]> {
  const comprovacions: Omit<ComprovacioOrfes, 'orfes'>[] = [
    { taula: 'comanda', columna: 'client_id', taulaReferenciada: 'client' },
    { taula: 'comanda', columna: 'tarifa_id', taulaReferenciada: 'tarifa' },
    { taula: 'comanda_linia', columna: 'producte_id', taulaReferenciada: 'producte' },
    { taula: 'comanda_linia', columna: 'alias_producte_id', taulaReferenciada: 'alias_producte' },
  ];

  // taula/columna/taulaReferenciada nunca vienen de una petición: son los
  // 4 literales fijos de arriba — interpolarlos acá no es una inyección
  // SQL (mismo criterio que resolverUuid en rutes/api/comu.ts).
  const resultats: ComprovacioOrfes[] = [];
  for (const c of comprovacions) {
    const res = await client.query<{ count: string }>(
      `SELECT count(*) FROM ${c.taula} orig
       WHERE orig.${c.columna} IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${c.taulaReferenciada} ref WHERE ref.id = orig.${c.columna})`,
    );
    resultats.push({ ...c, orfes: Number(res.rows[0]!.count) });
  }
  return resultats;
}

interface FilaProtegida {
  id: string;
  codi: string | null;
  nom: string | null;
}

export interface ProteccionsNeteja {
  productes: FilaProtegida[];
  clients: FilaProtegida[];
  tarifes: FilaProtegida[];
}

export interface RecompteNeteja {
  aliasProducteEsborrats: number;
  rendimentsPorcsEsborrats: number;
  preusEsborrats: number;
  clientsEsborrats: number;
  tarifesEsborrades: number;
  productesEsborrats: number;
}

export type ResultatNeteja =
  | { feta: false; motiu: 'res_per_esborrar' | 'cancellat'; proteccions: ProteccionsNeteja }
  | { feta: true; proteccions: ProteccionsNeteja; recompte: RecompteNeteja };

/**
 * Calcula qué está protegido — pura consulta, sin borrar nada. Exportada
 * aparte para que quien llame (CLI o test) pueda mostrar/verificar la
 * protección sin tener que ejecutar el borrado.
 */
export async function calcularProteccions(dbPool: Pool): Promise<ProteccionsNeteja> {
  const productesProtegits = await dbPool.query<FilaProtegida>(
    `SELECT DISTINCT p.id, p.codi, p.descripcio AS nom FROM producte p
     WHERE EXISTS (SELECT 1 FROM comanda_linia cl WHERE cl.producte_id = p.id)`,
  );
  const clientsProtegits = await dbPool.query<FilaProtegida>(
    `SELECT DISTINCT cli.id, cli.codi, cli.nom FROM client cli
     WHERE EXISTS (SELECT 1 FROM comanda c WHERE c.client_id = cli.id)`,
  );
  const idsClientsProtegits = clientsProtegits.rows.map((r) => r.id);

  // tarifa: protegida por comanda.tarifa_id directo, O por estar asignada
  // (client.tarifa_id) a un client que YA está protegido — ver el
  // comentario de cabecera del archivo.
  const tarifesProtegides = await dbPool.query<FilaProtegida>(
    `SELECT DISTINCT t.id, t.codi, t.nom FROM tarifa t
     WHERE EXISTS (SELECT 1 FROM comanda c WHERE c.tarifa_id = t.id)
        OR EXISTS (
          SELECT 1 FROM client cli
          WHERE cli.tarifa_id = t.id AND cli.id = ANY($1::uuid[])
        )`,
    [oParaComparar(idsClientsProtegits)],
  );

  return {
    productes: productesProtegits.rows,
    clients: clientsProtegits.rows,
    tarifes: tarifesProtegides.rows,
  };
}

/**
 * Ejecuta el borrado (una sola transacción, orden documentado en la
 * cabecera del archivo) asumiendo que la confirmación YA se obtuvo — no
 * pide nada por consola. Separada de `netejarCargaInicial` para que el
 * test pueda invocarla directo, sin pasar por `readline`.
 */
async function esborrar(dbPool: Pool, proteccions: ProteccionsNeteja): Promise<RecompteNeteja> {
  const idsProductesProtegits = proteccions.productes.map((r) => r.id);
  const idsClientsProtegits = proteccions.clients.map((r) => r.id);
  const idsTarifesProtegides = proteccions.tarifes.map((r) => r.id);

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    try {
      // 1. alias_producte de los producte NO protegidos — pero nunca una
      // fila todavía referenciada por un comanda_linia.alias_producte_id
      // real, aunque su producte_id no esté protegido.
      const aliasProducteEsborrats = await client.query(
        `DELETE FROM alias_producte
         WHERE NOT (producte_id = ANY($1::uuid[]))
           AND id NOT IN (
             SELECT alias_producte_id FROM comanda_linia WHERE alias_producte_id IS NOT NULL
           )`,
        [oParaComparar(idsProductesProtegits)],
      );

      // 2. rendiments_porcs de los producte NO protegidos.
      const rendimentsEsborrats = await client.query(
        `DELETE FROM rendiments_porcs WHERE NOT (producte_id = ANY($1::uuid[]))`,
        [oParaComparar(idsProductesProtegits)],
      );

      // 3. tarifa_preu de cualquier tarifa O producte que se vaya a borrar.
      const preusEsborrats = await client.query(
        `DELETE FROM tarifa_preu
         WHERE NOT (tarifa_id = ANY($1::uuid[])) OR NOT (producte_id = ANY($2::uuid[]))`,
        [oParaComparar(idsTarifesProtegides), oParaComparar(idsProductesProtegits)],
      );

      // 4. client (ANTES que tarifa — ver comentario de cabecera).
      const clientsEsborrats = await client.query(
        `DELETE FROM client WHERE NOT (id = ANY($1::uuid[]))`,
        [oParaComparar(idsClientsProtegits)],
      );

      // 5. tarifa (ya sin tarifa_preu ni client apuntándole).
      const tarifesEsborrades = await client.query(
        `DELETE FROM tarifa WHERE NOT (id = ANY($1::uuid[]))`,
        [oParaComparar(idsTarifesProtegides)],
      );

      // 6. producte (ya sin alias_producte, rendiments_porcs ni tarifa_preu
      // apuntándole).
      const productesEsborrats = await client.query(
        `DELETE FROM producte WHERE NOT (id = ANY($1::uuid[]))`,
        [oParaComparar(idsProductesProtegits)],
      );

      // Red de seguridad ADICIONAL a las protecciones de arriba (no las
      // reemplaza) — ver el comentario de comprovarIntegritatPostEsborrat.
      const comprovacio = await comprovarIntegritatPostEsborrat(client);
      const ambOrfes = comprovacio.filter((c) => c.orfes > 0);
      if (ambOrfes.length > 0) {
        const detall = ambOrfes
          .map(
            (c) =>
              `${c.orfes} fila(es) de ${c.taula}.${c.columna} → ${c.taulaReferenciada} inexistent`,
          )
          .join('; ');
        throw new Error(
          `Comprovació d'integritat post-esborrat FALLIDA: ${detall}. No es va confirmar res ` +
            '(ROLLBACK). Això indica que el reset es va córrer amb la base en un estat ' +
            "parcial/inconsistent (ex.: pedidos carregats de forma incompleta). Revisa l'ordre " +
            'de les operacions (ingesta de comandes completa ABANS del reset, mai a mitges) ' +
            'abans de tornar a intentar-ho.',
        );
      }

      await client.query('COMMIT');

      return {
        aliasProducteEsborrats: aliasProducteEsborrats.rowCount ?? 0,
        rendimentsPorcsEsborrats: rendimentsEsborrats.rowCount ?? 0,
        preusEsborrats: preusEsborrats.rowCount ?? 0,
        clientsEsborrats: clientsEsborrats.rowCount ?? 0,
        tarifesEsborrades: tarifesEsborrades.rowCount ?? 0,
        productesEsborrats: productesEsborrats.rowCount ?? 0,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      // FK RESTRICT no anticipada — se re-lanza con contexto en vez de un
      // error crudo de pg, para que quede claro qué tabla falta contemplar
      // (ver el comentario de cabecera con las FK ya repasadas).
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

/**
 * Punto de entrada de la lógica completa (protecciones → confirmación →
 * borrado), inyectando `confirmar` para poder saltarla en tests. No
 * imprime nada por consola — eso lo hace `main()`, para que esta función
 * sea igual de útil desde un test que desde la CLI.
 */
export async function netejarCargaInicial(
  dbPool: Pool,
  confirmar: () => Promise<boolean> = confirmarPerConsola,
): Promise<ResultatNeteja> {
  const proteccions = await calcularProteccions(dbPool);

  const [totalTarifes, totalProductes, totalClients] = await Promise.all([
    dbPool.query<{ count: string }>('SELECT count(*) FROM tarifa'),
    dbPool.query<{ count: string }>('SELECT count(*) FROM producte'),
    dbPool.query<{ count: string }>('SELECT count(*) FROM client'),
  ]);
  const aBorrarTarifes = Number(totalTarifes.rows[0]!.count) - proteccions.tarifes.length;
  const aBorrarProductes = Number(totalProductes.rows[0]!.count) - proteccions.productes.length;
  const aBorrarClients = Number(totalClients.rows[0]!.count) - proteccions.clients.length;

  if (aBorrarTarifes === 0 && aBorrarProductes === 0 && aBorrarClients === 0) {
    return { feta: false, motiu: 'res_per_esborrar', proteccions };
  }

  if (!(await confirmar())) {
    return { feta: false, motiu: 'cancellat', proteccions };
  }

  const recompte = await esborrar(dbPool, proteccions);
  return { feta: true, proteccions, recompte };
}

async function main(): Promise<void> {
  // Mismo espíritu que la guarda de netejar-historic-desenvolupament.ts,
  // pero invertida: ACÁ sí se permite producción, porque este script se va
  // a usar contra Cloud SQL real para limpiar los datos de prueba antes
  // del cut-over — pero nunca por descuido, sólo con el flag explícito.
  if (env.NODE_ENV === 'production' && !process.argv.includes('--permitir-produccio')) {
    throw new Error(
      'Aquest script és destructiu i NODE_ENV=production — rebutjat. Si de veritat voleu ' +
        "córrer-lo contra producció (per netejar les dades de PROVA d'aquesta simulació abans " +
        'del cut-over real), passeu --permitir-produccio explícitament.',
    );
  }

  const proteccionsPrevia = await calcularProteccions(poolPerDefecte);
  if (proteccionsPrevia.tarifes.length > 0) {
    console.log(
      `${proteccionsPrevia.tarifes.length} tarifa(es) NO s'esborraran perquè ja tenen comandes reals, ` +
        'o estan assignades a un client que en té:',
    );
    for (const t of proteccionsPrevia.tarifes)
      console.log(`  - ${t.codi ?? '(sense codi)'} "${t.nom}"`);
  }
  if (proteccionsPrevia.productes.length > 0) {
    console.log(
      `${proteccionsPrevia.productes.length} producte(s) NO s'esborraran perquè ja tenen línies de comanda reals:`,
    );
    for (const p of proteccionsPrevia.productes)
      console.log(`  - ${p.codi ?? '(sense codi)'} "${p.nom}"`);
  }
  if (proteccionsPrevia.clients.length > 0) {
    console.log(
      `${proteccionsPrevia.clients.length} client(s) NO s'esborraran perquè ja tenen comandes reals:`,
    );
    for (const c of proteccionsPrevia.clients)
      console.log(`  - ${c.codi ?? '(sense codi)'} "${c.nom ?? ''}"`);
  }

  const resultat = await netejarCargaInicial(poolPerDefecte);

  if (!resultat.feta) {
    console.log(
      resultat.motiu === 'res_per_esborrar'
        ? 'Res per esborrar.'
        : 'Cancel·lat — no es va esborrar res.',
    );
    return;
  }

  console.log(resultat.recompte);
}

const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  main()
    .catch((err: unknown) => {
      logger.error({ err }, 'El reset de carga inicial va fallar — res es va esborrar (ROLLBACK)');
      process.exitCode = 1;
    })
    .finally(() => cerrarPool());
}
