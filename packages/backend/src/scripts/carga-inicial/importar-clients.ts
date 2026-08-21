/**
 * Carga inicial de clientes desde un .xlsx (docs/especificacion-funcional-
 * dpages-v2.md sección 6). Capa 18 — SIMULADA: el archivo de hoy es un
 * ejemplo generado a mano (generar-dades-exemple.ts), no el Excel real del
 * cliente — ver src/scripts/README.md.
 *
 * Columnas esperadas: codi, nom, poblacio, tarifaCodi (opcional).
 *
 * ORDEN DE EJECUCIÓN: puede correr en cualquier momento DESPUÉS de
 * importar-tarifes.ts (README.md) — valida tarifaCodi contra las tarifas ya
 * importadas, cuando viene informado.
 *
 * Valida TODAS las filas antes de escribir nada — si hay un solo error, se
 * reportan todos juntos y no se toca la base.
 *
 * UPSERT por codi (correrlo de nuevo no duplica, actualiza) — usa el mismo
 * índice único parcial que protege producte.codi/tarifa.codi
 * (idx_client_codi, migración 0015; hasta esa migración, client.codi no
 * tenía ningún índice único y este script resolvía el upsert a mano con
 * un SELECT-then-INSERT/UPDATE no atómico).
 *
 * Uso: tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/importar-clients.ts
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cerrarPool, pool } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { type FilaCruda, leerHojaXlsx } from './lectura-xlsx.js';
import { celdaATexto } from './valors-crudos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ARXIU_ENTRADA = path.join(__dirname, 'entrada', 'clients-exemple.xlsx');

export interface ErrorValidacio {
  fila: number;
  camp: string;
  missatge: string;
}

export interface ClientValidat {
  fila: number;
  codi: string;
  nom: string;
  poblacio: string;
  tarifaCodi: string | null;
}

export interface ResultatValidacioClients {
  valids: ClientValidat[];
  errors: ErrorValidacio[];
  duplicats: { fila: number; codi: string }[];
}

/**
 * Pura — sin acceso a base. `tarifaCodisValids` viene resuelto por el
 * llamador (una consulta a tarifa, ya importada por importar-tarifes.ts).
 */
export function validarClients(
  files: FilaCruda[],
  tarifaCodisValids: ReadonlySet<string>,
): ResultatValidacioClients {
  const errors: ErrorValidacio[] = [];
  const duplicats: { fila: number; codi: string }[] = [];
  const porCodi = new Map<string, ClientValidat>();

  for (const { fila, valors } of files) {
    const codi = celdaATexto(valors.codi);
    const nom = celdaATexto(valors.nom);
    const poblacio = celdaATexto(valors.poblacio);
    const tarifaCodi = celdaATexto(valors.tarifaCodi) || null;
    const errorsAbans = errors.length;

    if (!codi) errors.push({ fila, camp: 'codi', missatge: 'és obligatori' });
    if (!nom) errors.push({ fila, camp: 'nom', missatge: 'és obligatori' });
    if (!poblacio) errors.push({ fila, camp: 'poblacio', missatge: 'és obligatòria' });
    if (tarifaCodi && !tarifaCodisValids.has(tarifaCodi)) {
      errors.push({
        fila,
        camp: 'tarifaCodi',
        missatge: `"${tarifaCodi}" no existeix — cal importar-tarifes.ts abans`,
      });
    }

    if (!codi) continue;
    if (errors.length > errorsAbans) continue; // esta fila tuvo algún error — no es "válida"

    if (porCodi.has(codi)) duplicats.push({ fila, codi });
    porCodi.set(codi, { fila, codi, nom, poblacio, tarifaCodi });
  }

  return { valids: [...porCodi.values()], errors, duplicats };
}

async function main(): Promise<void> {
  const files = await leerHojaXlsx(ARXIU_ENTRADA);

  const tarifesRes = await pool.query<{ codi: string }>(
    'SELECT codi FROM tarifa WHERE codi IS NOT NULL',
  );
  const tarifaCodisValids = new Set(tarifesRes.rows.map((r) => r.codi));

  const { valids, errors, duplicats } = validarClients(files, tarifaCodisValids);

  if (errors.length > 0) {
    console.error(`${errors.length} error(s) de validació — no es va escriure res:`);
    for (const e of errors) {
      console.error(`  Fila ${e.fila}, camp "${e.camp}": ${e.missatge}`);
    }
    process.exitCode = 1;
    return;
  }

  let creats = 0;
  let actualitzats = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const c of valids) {
      let tarifaId: string | null = null;
      if (c.tarifaCodi) {
        const tarifaRes = await client.query<{ id: string }>(
          'SELECT id FROM tarifa WHERE codi = $1',
          [c.tarifaCodi],
        );
        tarifaId = tarifaRes.rows[0]?.id ?? null;
      }

      const resultat = await client.query<{ es_nou: boolean }>(
        `INSERT INTO client (codi, nom, poblacio, tarifa_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (codi) WHERE codi IS NOT NULL DO UPDATE SET
           nom = EXCLUDED.nom,
           poblacio = EXCLUDED.poblacio,
           tarifa_id = EXCLUDED.tarifa_id
         RETURNING (xmax = 0) AS es_nou`,
        [c.codi, c.nom, c.poblacio, tarifaId],
      );
      if (resultat.rows[0]?.es_nou) creats++;
      else actualitzats++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log({
    arxiu: ARXIU_ENTRADA,
    filesLlegides: files.length,
    creats,
    actualitzats,
    saltats: duplicats.length,
    motiuSaltats:
      duplicats.length > 0
        ? "codi duplicat dins del mateix arxiu — es va fer servir l'última fila"
        : undefined,
    duplicats,
  });
}

const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  main()
    .catch((err: unknown) => {
      logger.error({ err }, 'La importació de clients va fallar — res es va escriure (ROLLBACK)');
      process.exitCode = 1;
    })
    .finally(() => cerrarPool());
}
