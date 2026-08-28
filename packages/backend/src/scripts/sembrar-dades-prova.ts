/**
 * Reset + seed de datos de PRUEBA para desarrollo local — borra TODO lo que
 * hay hoy en producte/tarifa/tarifa_preu/client/comanda (+ sus dependientes
 * por FK) y carga ~10 productos, 3 tarifas con precios dispersos, 4 clientes
 * y 3 comandes de ejemplo, con relaciones consistentes entre sí. Pensado
 * para poder probar Catàleg/Tarifes/Clients/Comandes/Rendiments Porcs contra
 * datos reales sin depender de lo que haya quedado de sesiones anteriores.
 *
 * A diferencia de seed-arranque.ts (UPSERT, no destructivo, corre incluso en
 * producción): esto SIEMPRE borra antes de sembrar, así que NUNCA corre en
 * producción (mismo criterio que netejar-historic-desenvolupament.ts, sin
 * flag de excepción — a diferencia de carga-inicial/reset-carga-inicial.ts,
 * que sí tiene un caso de uso real contra Cloud SQL, este no).
 *
 * NO usa la lógica de "proteger filas que ya tienen un pedido real" de
 * reset-carga-inicial.ts a propósito: acá el borrado es incondicional,
 * pensado para una base de desarrollo que sólo tiene datos de prueba.
 *
 * NO toca categoria_producte (las 8 categorías de seed-arranque.ts se
 * quedan tal cual), transportista ni origen_comanda (se usa su fila
 * 'manual' ya sembrada).
 *
 * Todos los codi/nom de lo que este script crea llevan el prefijo "SEED"
 * (codi) o "[SEED]" (nom/descripció) — visualmente inconfundible con datos
 * reales si alguien los ve por error.
 *
 * Orden de borrado (hijos antes que padres; alias_producte y
 * rendiments_porcs se incluyen aunque no se sembran datos ahí, porque
 * ambas tablas referencian producte con FK NOT NULL sin ON DELETE —
 * vaciar producte sin vaciarlas antes rompe con un 23503):
 *   1. incidencia_comanda
 *   2. comanda_linia
 *   3. comanda
 *   4. rendiments_porcs
 *   5. alias_producte
 *   6. tarifa_preu
 *   7. client
 *   8. tarifa
 *   9. producte
 *
 * Uso: tsx --env-file-if-exists=../.env src/scripts/sembrar-dades-prova.ts [--yes]
 *   --yes  omet el prompt interactiu ("escriu CONFIRMAR") — pensat per a ús
 *          no interactiu; SEMPRE cal passar-lo o confirmar a mà, mai corre
 *          en silenci.
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { env } from '../config/env.js';
import { cerrarPool, pool as poolPerDefecte } from '../db/pool.js';
import { logger } from '../lib/logger.js';

// ── Dades de prova ──────────────────────────────────────────────────────

interface ProducteSeed {
  codi: string;
  descripcio: string;
  categoriaNom: string;
  agrupacioProduccio: string | null;
  format: 'SENCER' | 'TALLAT' | 'LLESCAT' | null;
  envasat: 'NORMAL' | 'NORMAL (pes)' | 'NORMAL (web)' | 'ESPECIAL';
  /** null = article "a mida" (sense pes de fitxa) — a propòsit en 3 dels 10. */
  pesKg: number | null;
  preuVenda: number;
}

// Repartits entre 7 de les 8 categories ja sembrades per seed-arranque.ts
// (ELABORAT FUMAT i VÍSCERES incloses; ELABORAT CUIT també) — cap categoria
// nova, cap es toca.
const PRODUCTES: ProducteSeed[] = [
  {
    codi: 'SEED-LLOM',
    descripcio: '[SEED] Llom fresc de porc',
    categoriaNom: 'PECES NOBLES KG',
    agrupacioProduccio: 'LLOM',
    format: 'SENCER',
    envasat: 'NORMAL (pes)',
    pesKg: 1.2,
    preuVenda: 9.5,
  },
  {
    codi: 'SEED-COST',
    descripcio: '[SEED] Costella de porc',
    categoriaNom: 'PECES NOBLES KG',
    agrupacioProduccio: 'COSTELLA',
    format: 'TALLAT',
    envasat: 'NORMAL (pes)',
    pesKg: 0.8,
    preuVenda: 7.2,
  },
  {
    codi: 'SEED-SECR',
    descripcio: '[SEED] Secret de porc',
    categoriaNom: 'PECES NOBLES PAQ',
    agrupacioProduccio: 'SECRET',
    format: 'SENCER',
    envasat: 'NORMAL',
    pesKg: null,
    preuVenda: 12.0,
  },
  {
    codi: 'SEED-PEUS',
    descripcio: '[SEED] Peus de porc',
    categoriaNom: 'PECES NOBLES PAQ',
    agrupacioProduccio: 'PEUS',
    format: 'SENCER',
    envasat: 'NORMAL',
    pesKg: 0.5,
    preuVenda: 3.0,
  },
  {
    codi: 'SEED-MAGR',
    descripcio: '[SEED] Magre de porc a trossos',
    categoriaNom: 'PECES MAGRES',
    agrupacioProduccio: null,
    format: 'TALLAT',
    envasat: 'NORMAL (pes)',
    pesKg: null,
    preuVenda: 8.5,
  },
  {
    codi: 'SEED-BOT',
    descripcio: '[SEED] Botifarra crua',
    categoriaNom: 'ELABORAT FRESC',
    agrupacioProduccio: 'BOTIFARRA',
    format: null,
    envasat: 'NORMAL',
    pesKg: 0.4,
    preuVenda: 6.2,
  },
  {
    codi: 'SEED-FUET',
    descripcio: '[SEED] Fuet extra',
    categoriaNom: 'ELABORAT CURAT',
    agrupacioProduccio: null,
    format: null,
    envasat: 'ESPECIAL',
    pesKg: 0.25,
    preuVenda: 9.5,
  },
  {
    codi: 'SEED-XORI',
    descripcio: '[SEED] Xoriço picant',
    categoriaNom: 'ELABORAT CUIT',
    agrupacioProduccio: null,
    format: null,
    envasat: 'NORMAL',
    pesKg: 0.3,
    preuVenda: 7.5,
  },
  {
    codi: 'SEED-CANS',
    descripcio: '[SEED] Cansalada fumada',
    categoriaNom: 'ELABORAT FUMAT',
    agrupacioProduccio: null,
    format: 'LLESCAT',
    envasat: 'NORMAL (web)',
    pesKg: 0.2,
    preuVenda: 6.5,
  },
  {
    codi: 'SEED-FETGE',
    descripcio: '[SEED] Fetge de porc',
    categoriaNom: 'VÍSCERES',
    agrupacioProduccio: null,
    format: null,
    envasat: 'NORMAL',
    pesKg: null,
    preuVenda: 4.2,
  },
];

interface TarifaSeed {
  codi: string;
  nom: string;
}

const TARIFES: TarifaSeed[] = [
  { codi: 'SEED-GEN', nom: '[SEED] Tarifa general' },
  { codi: 'SEED-REST', nom: '[SEED] Tarifa restaurants' },
  { codi: 'SEED-BOT', nom: '[SEED] Tarifa botigues' },
];

interface PreuSeed {
  tarifaCodi: string;
  producteCodi: string;
  preu: number;
}

// Matriu DISPERSA a propòsit (mateix criteri que
// carga-inicial/generar-dades-exemple.ts): SEED-GEN té preu pels 10
// productes, SEED-REST només per 5, SEED-BOT només per 4 — deixa forats
// perquè la matriu de tarifes real (GET /tarifes/matriu) els mostri en null.
const PREUS: PreuSeed[] = [
  ...PRODUCTES.map((p): PreuSeed => ({ tarifaCodi: 'SEED-GEN', producteCodi: p.codi, preu: p.preuVenda })),
  { tarifaCodi: 'SEED-REST', producteCodi: 'SEED-LLOM', preu: 8.9 },
  { tarifaCodi: 'SEED-REST', producteCodi: 'SEED-COST', preu: 6.5 },
  { tarifaCodi: 'SEED-REST', producteCodi: 'SEED-SECR', preu: 11.0 },
  { tarifaCodi: 'SEED-REST', producteCodi: 'SEED-PEUS', preu: 2.7 },
  { tarifaCodi: 'SEED-REST', producteCodi: 'SEED-BOT', preu: 5.6 },
  { tarifaCodi: 'SEED-BOT', producteCodi: 'SEED-LLOM', preu: 9.1 },
  { tarifaCodi: 'SEED-BOT', producteCodi: 'SEED-COST', preu: 6.9 },
  { tarifaCodi: 'SEED-BOT', producteCodi: 'SEED-BOT', preu: 5.8 },
  // SEED-XORI NO tiene precio en SEED-BOT a propósito — la línea de la
  // comanda amb_incidencia lo referencia igual, con preuUnitari 0 puesto a
  // mano (ver COMANDES abajo).
];

interface ClientSeed {
  codi: string;
  nom: string;
  poblacio: string;
  tarifaCodi: string | null;
}

// 2 con tarifa asignada, 2 sin — pedido explícito.
const CLIENTS: ClientSeed[] = [
  { codi: 'SEED-CLI001', nom: '[SEED] Restaurant Can Prova', poblacio: 'Manresa', tarifaCodi: 'SEED-REST' },
  { codi: 'SEED-CLI002', nom: '[SEED] Botiga Prova Centre', poblacio: 'Vic', tarifaCodi: 'SEED-BOT' },
  { codi: 'SEED-CLI003', nom: '[SEED] Client sense tarifa assignada', poblacio: 'Igualada', tarifaCodi: null },
  { codi: 'SEED-CLI004', nom: '[SEED] Client ocasional', poblacio: 'Terrassa', tarifaCodi: null },
];

interface LiniaSeed {
  producteCodi: string;
  unitatsDemanades: number;
  preuUnitari: number;
  /** Sólo para productes "a mida" (pesKg null) — pes manual > 0. */
  pesManual?: number;
}

interface ComandaSeed {
  clientCodi: string;
  tarifaCodi: string | null;
  estat: 'oberta' | 'en_proces' | 'tancada' | 'amb_incidencia';
  dataProduccio: string;
  dataExpedicio: string;
  dataLliurament: string;
  bultos: number;
  obsProduccio: string;
  poblacioDesti: string;
  linies: LiniaSeed[];
  /** Sólo la comanda amb_incidencia la trae. */
  incidencia?: { tipus: string; detall: string };
}

// 3 comandes: una normal con tarifa (A), una normal sin tarifa (B), y una
// amb_incidencia por una línea sin precio real (C) — pedido explícito.
const COMANDES: ComandaSeed[] = [
  {
    clientCodi: 'SEED-CLI001',
    tarifaCodi: 'SEED-REST',
    estat: 'oberta',
    dataProduccio: '2026-09-01',
    dataExpedicio: '2026-09-03',
    dataLliurament: '2026-09-05',
    bultos: 3,
    obsProduccio: '[SEED] Comanda de prova generada per sembrar-dades-prova.ts',
    poblacioDesti: 'Manresa',
    linies: [
      { producteCodi: 'SEED-LLOM', unitatsDemanades: 2, preuUnitari: 8.9 },
      { producteCodi: 'SEED-COST', unitatsDemanades: 3, preuUnitari: 6.5 },
      { producteCodi: 'SEED-SECR', unitatsDemanades: 1, preuUnitari: 11.0, pesManual: 0.45 },
    ],
  },
  {
    clientCodi: 'SEED-CLI003',
    tarifaCodi: null,
    estat: 'en_proces',
    dataProduccio: '2026-09-02',
    dataExpedicio: '2026-09-04',
    dataLliurament: '2026-09-06',
    bultos: 1,
    obsProduccio: '[SEED] Client sense tarifa — preu agafat directe de preuVenda.',
    poblacioDesti: 'Igualada',
    linies: [
      { producteCodi: 'SEED-MAGR', unitatsDemanades: 2, preuUnitari: 8.5, pesManual: 1.5 },
      { producteCodi: 'SEED-FETGE', unitatsDemanades: 1, preuUnitari: 4.2, pesManual: 0.6 },
    ],
  },
  {
    clientCodi: 'SEED-CLI002',
    tarifaCodi: 'SEED-BOT',
    estat: 'amb_incidencia',
    dataProduccio: '2026-09-01',
    dataExpedicio: '2026-09-02',
    dataLliurament: '2026-09-04',
    bultos: 2,
    obsProduccio: '[SEED] SEED-XORI no té preu carregat a SEED-BOT — línia amb preuUnitari 0.',
    poblacioDesti: 'Vic',
    linies: [
      { producteCodi: 'SEED-BOT', unitatsDemanades: 2, preuUnitari: 5.8 },
      { producteCodi: 'SEED-XORI', unitatsDemanades: 2, preuUnitari: 0 },
    ],
    incidencia: {
      tipus: 'preu_no_trobat',
      detall: '[SEED] SEED-XORI no té preu a la tarifa SEED-BOT — cal confirmar-lo a mà abans de tancar la comanda.',
    },
  },
];

// ── Borrat ───────────────────────────────────────────────────────────────

interface RecompteEsborrat {
  incidenciesEsborrades: number;
  liniesEsborrades: number;
  comandesEsborrades: number;
  rendimentsPorcsEsborrats: number;
  aliasProducteEsborrats: number;
  preusEsborrats: number;
  clientsEsborrats: number;
  tarifesEsborrades: number;
  productesEsborrats: number;
}

async function esborrarTot(client: PoolClient): Promise<RecompteEsborrat> {
  const incidencies = await client.query('DELETE FROM incidencia_comanda');
  const linies = await client.query('DELETE FROM comanda_linia');
  const comandes = await client.query('DELETE FROM comanda');
  const rendiments = await client.query('DELETE FROM rendiments_porcs');
  const alias = await client.query('DELETE FROM alias_producte');
  const preus = await client.query('DELETE FROM tarifa_preu');
  const clients = await client.query('DELETE FROM client');
  const tarifes = await client.query('DELETE FROM tarifa');
  const productes = await client.query('DELETE FROM producte');

  return {
    incidenciesEsborrades: incidencies.rowCount ?? 0,
    liniesEsborrades: linies.rowCount ?? 0,
    comandesEsborrades: comandes.rowCount ?? 0,
    rendimentsPorcsEsborrats: rendiments.rowCount ?? 0,
    aliasProducteEsborrats: alias.rowCount ?? 0,
    preusEsborrats: preus.rowCount ?? 0,
    clientsEsborrats: clients.rowCount ?? 0,
    tarifesEsborrades: tarifes.rowCount ?? 0,
    productesEsborrats: productes.rowCount ?? 0,
  };
}

// ── Sembrat ──────────────────────────────────────────────────────────────

async function sembrarProductes(client: PoolClient): Promise<void> {
  for (const p of PRODUCTES) {
    await client.query(
      `INSERT INTO producte (codi, descripcio, categoria_id, agrupacio_produccio, format, envasat, pes_kg, preu_venda)
       VALUES ($1, $2, (SELECT id FROM categoria_producte WHERE nom = $3), $4, $5, $6, $7, $8)`,
      [p.codi, p.descripcio, p.categoriaNom, p.agrupacioProduccio, p.format, p.envasat, p.pesKg, p.preuVenda],
    );
  }
}

async function sembrarTarifes(client: PoolClient): Promise<void> {
  for (const t of TARIFES) {
    await client.query(`INSERT INTO tarifa (codi, nom) VALUES ($1, $2)`, [t.codi, t.nom]);
  }
}

async function sembrarPreus(client: PoolClient): Promise<void> {
  for (const p of PREUS) {
    await client.query(
      `INSERT INTO tarifa_preu (tarifa_id, producte_id, preu)
       VALUES ((SELECT id FROM tarifa WHERE codi = $1), (SELECT id FROM producte WHERE codi = $2), $3)`,
      [p.tarifaCodi, p.producteCodi, p.preu],
    );
  }
}

async function sembrarClients(client: PoolClient): Promise<void> {
  for (const c of CLIENTS) {
    // Subquery amb $4 = null no coincideix amb cap fila (codi = NULL mai és
    // true en SQL) → retorna NULL escalar, exactament el que es vol quan
    // tarifaCodi és null.
    await client.query(
      `INSERT INTO client (codi, nom, poblacio, tarifa_id)
       VALUES ($1, $2, $3, (SELECT id FROM tarifa WHERE codi = $4))`,
      [c.codi, c.nom, c.poblacio, c.tarifaCodi],
    );
  }
}

async function sembrarComanda(client: PoolClient, c: ComandaSeed): Promise<void> {
  const total = c.linies.reduce((acc, l) => acc + l.unitatsDemanades * l.preuUnitari, 0);

  const inserida = await client.query<{ id: string }>(
    `INSERT INTO comanda (
       origen_id, estat, client_id, tarifa_id, data_produccio, data_expedicio,
       data_lliurament, bultos, obs_produccio, poblacio_desti, total
     ) VALUES (
       (SELECT id FROM origen_comanda WHERE codi = 'manual'),
       $1, (SELECT id FROM client WHERE codi = $2), (SELECT id FROM tarifa WHERE codi = $3),
       $4, $5, $6, $7, $8, $9, $10
     ) RETURNING id`,
    [
      c.estat,
      c.clientCodi,
      c.tarifaCodi,
      c.dataProduccio,
      c.dataExpedicio,
      c.dataLliurament,
      c.bultos,
      c.obsProduccio,
      c.poblacioDesti,
      total.toFixed(2),
    ],
  );
  const comandaId = inserida.rows[0]!.id;

  let ordinal = 1;
  for (const l of c.linies) {
    const producte = await client.query<{ pes_kg: string | null }>(
      `SELECT pes_kg FROM producte WHERE codi = $1`,
      [l.producteCodi],
    );
    const pesFitxaKg = producte.rows[0]?.pes_kg ?? null;
    const esAMida = pesFitxaKg === null;
    const pesCalculatKg = esAMida ? l.pesManual! : Number(pesFitxaKg) * l.unitatsDemanades;

    await client.query(
      `INSERT INTO comanda_linia (
         comanda_id, ordinal, producte_id, unitats_demanades, preu_unitari,
         pes_fitxa_kg, pes_calculat_kg, pes_editable, data_produccio
       ) VALUES (
         $1, $2, (SELECT id FROM producte WHERE codi = $3), $4, $5, $6, $7, $8, $9
       )`,
      [
        comandaId,
        ordinal++,
        l.producteCodi,
        l.unitatsDemanades,
        l.preuUnitari,
        pesFitxaKg,
        pesCalculatKg,
        esAMida,
        c.dataProduccio,
      ],
    );
  }

  if (c.incidencia) {
    await client.query(`INSERT INTO incidencia_comanda (comanda_id, tipus, detall) VALUES ($1, $2, $3)`, [
      comandaId,
      c.incidencia.tipus,
      c.incidencia.detall,
    ]);
  }
}

async function sembrarComandes(client: PoolClient): Promise<void> {
  for (const c of COMANDES) await sembrarComanda(client, c);
}

// ── Confirmació i entry point ───────────────────────────────────────────

async function confirmarPerConsola(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const resposta = await rl.question('Escriu CONFIRMAR per continuar: ');
    return resposta.trim() === 'CONFIRMAR';
  } finally {
    rl.close();
  }
}

export interface ResultatSembrat {
  esborrat: RecompteEsborrat;
  sembrat: {
    productes: number;
    tarifes: number;
    preus: number;
    clients: number;
    comandes: number;
  };
}

/**
 * Ejecuta borrado + siembra en una sola transacción — asume que la
 * confirmación YA se obtuvo, no pregunta nada por consola (mismo criterio
 * de separación que reset-carga-inicial.ts, para poder testear sin pasar
 * por readline).
 */
export async function sembrarDadesProva(dbPool: Pool): Promise<ResultatSembrat> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const esborrat = await esborrarTot(client);
    await sembrarProductes(client);
    await sembrarTarifes(client);
    await sembrarPreus(client);
    await sembrarClients(client);
    await sembrarComandes(client);
    await client.query('COMMIT');

    return {
      esborrat,
      sembrat: {
        productes: PRODUCTES.length,
        tarifes: TARIFES.length,
        preus: PREUS.length,
        clients: CLIENTS.length,
        comandes: COMANDES.length,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  // Mismo criterio que netejar-historic-desenvolupament.ts: script
  // destructivo de datos de DESARROLLO, sin ningún flag de excepción (a
  // diferencia de reset-carga-inicial.ts, que sí tiene un caso de uso real
  // contra Cloud SQL) — nunca puede correr contra producción.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Aquest script esborra dades i és només per a desenvolupament local — rebutjat amb NODE_ENV=production.',
    );
  }

  const [{ rows: totalProductes }, { rows: totalTarifes }, { rows: totalClients }, { rows: totalComandes }] =
    await Promise.all([
      poolPerDefecte.query<{ count: string }>('SELECT count(*) FROM producte'),
      poolPerDefecte.query<{ count: string }>('SELECT count(*) FROM tarifa'),
      poolPerDefecte.query<{ count: string }>('SELECT count(*) FROM client'),
      poolPerDefecte.query<{ count: string }>('SELECT count(*) FROM comanda'),
    ]);

  console.log(
    'Aquest script ESBORRARÀ TOT el que hi ha avui a producte ' +
      `(${totalProductes[0]!.count}), tarifa/tarifa_preu (${totalTarifes[0]!.count} tarifes), ` +
      `client (${totalClients[0]!.count}) i comanda/comanda_linia/incidencia_comanda ` +
      `(${totalComandes[0]!.count}) — també rendiments_porcs i alias_producte (dependents de producte ` +
      `per FK) — i sembrarà ${PRODUCTES.length} productes, ${TARIFES.length} tarifes, ${CLIENTS.length} ` +
      `clients i ${COMANDES.length} comandes de prova (prefix "SEED"). NO toca categoria_producte, ` +
      'transportista ni origen_comanda.',
  );

  const confirmat = process.argv.includes('--yes') || (await confirmarPerConsola());
  if (!confirmat) {
    console.log('Cancel·lat — no es va esborrar ni sembrar res.');
    return;
  }

  const resultat = await sembrarDadesProva(poolPerDefecte);
  console.log(resultat);
}

const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  main()
    .catch((err: unknown) => {
      logger.error({ err }, 'El sembrat de dades de prova va fallar — res es va tocar (ROLLBACK)');
      process.exitCode = 1;
    })
    .finally(() => cerrarPool());
}
