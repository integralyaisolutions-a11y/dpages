/**
 * Carga inicial de artículos desde un .xlsx (docs/especificacion-funcional-
 * dpages-v2.md sección 6). Capa 18 — SIMULADA: el archivo de entrada de hoy
 * es un ejemplo generado a mano (generar-dades-exemple.ts), no el Excel
 * real del cliente, que todavía no llegó — ver src/scripts/README.md.
 *
 * Columnas esperadas: codi, descripcio, categoria (nombre — debe existir ya
 * en categoria_producte, sembrada por seed-arranque.ts), agrupacioProduccio,
 * format, envasat, pesKg, preuVenda.
 *
 * ORDEN DE EJECUCIÓN OBLIGATORIO (README.md): PRIMERO este script — la hoja
 * "Preus" de importar-tarifes.ts depende de que los articleCodi ya existan.
 *
 * Valida TODAS las filas antes de escribir nada — si hay un solo error, se
 * reportan todos juntos y no se toca la base (falla completo o no falla,
 * nunca una importación parcial silenciosa).
 *
 * UPSERT por codi (correrlo de nuevo no duplica, actualiza) — usa el mismo
 * índice único parcial que ya protege producte.codi (migración 0002).
 *
 * Uso: tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/importar-articles.ts
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cerrarPool, pool } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { type FilaCruda, leerHojaXlsx } from './lectura-xlsx.js';
import { celdaANumero, celdaATexto } from './valors-crudos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ARXIU_ENTRADA = path.join(__dirname, 'entrada', 'articles-exemple.xlsx');

const FORMATS_VALIDS = ['SENCER', 'TALLAT', 'LLESCAT'] as const;
const ENVASATS_VALIDS = ['NORMAL', 'NORMAL (pes)', 'NORMAL (web)', 'ESPECIAL'] as const;

export interface ArticleValidat {
  fila: number;
  codi: string;
  descripcio: string;
  categoriaNom: string;
  agrupacioProduccio: string | null;
  format: string | null;
  envasat: string | null;
  pesKg: number | null;
  preuVenda: number | null;
}

export interface ErrorValidacio {
  fila: number;
  camp: string;
  missatge: string;
}

export interface ResultatValidacioArticles {
  valides: ArticleValidat[];
  errors: ErrorValidacio[];
  /** codi repetido dentro del mismo archivo — no es un error, se queda la última fila y se avisa. */
  duplicats: { fila: number; codi: string }[];
}

/**
 * Pura — sin acceso a base, para poder testearla con fixtures en memoria
 * (ver importar-articles.test.ts). `categoriesValides` la resuelve el
 * llamador (una consulta a categoria_producte), no se resuelve acá adentro.
 */
export function validarArticles(
  files: FilaCruda[],
  categoriesValides: ReadonlySet<string>,
): ResultatValidacioArticles {
  const errors: ErrorValidacio[] = [];
  const duplicats: { fila: number; codi: string }[] = [];
  const porCodi = new Map<string, ArticleValidat>();

  for (const { fila, valors } of files) {
    const errorsAbans = errors.length;
    const codi = celdaATexto(valors.codi);
    const descripcio = celdaATexto(valors.descripcio);
    const categoriaNom = celdaATexto(valors.categoria);
    const agrupacioProduccio = celdaATexto(valors.agrupacioProduccio) || null;
    const formatBrut = celdaATexto(valors.format);
    const envasatBrut = celdaATexto(valors.envasat);
    const pesKg = celdaANumero(valors.pesKg);
    const preuVenda = celdaANumero(valors.preuVenda);

    if (!codi) errors.push({ fila, camp: 'codi', missatge: 'és obligatori' });
    if (!descripcio) errors.push({ fila, camp: 'descripcio', missatge: 'és obligatòria' });

    if (!categoriaNom) {
      errors.push({ fila, camp: 'categoria', missatge: 'és obligatòria' });
    } else if (!categoriesValides.has(categoriaNom)) {
      errors.push({
        fila,
        camp: 'categoria',
        missatge: `"${categoriaNom}" no existeix a categoria_producte`,
      });
    }

    if (formatBrut && !FORMATS_VALIDS.includes(formatBrut as (typeof FORMATS_VALIDS)[number])) {
      errors.push({
        fila,
        camp: 'format',
        missatge: `ha de ser ${FORMATS_VALIDS.join(', ')} (o buit) — es va rebre "${formatBrut}"`,
      });
    }
    if (envasatBrut && !ENVASATS_VALIDS.includes(envasatBrut as (typeof ENVASATS_VALIDS)[number])) {
      errors.push({
        fila,
        camp: 'envasat',
        missatge: `ha de ser ${ENVASATS_VALIDS.join(', ')} (o buit) — es va rebre "${envasatBrut}"`,
      });
    }

    if (pesKg !== null && Number.isNaN(pesKg)) {
      errors.push({
        fila,
        camp: 'pesKg',
        missatge: 'ha de ser un número (o buit, per a articles "a mida")',
      });
    } else if (pesKg !== null && pesKg <= 0) {
      errors.push({ fila, camp: 'pesKg', missatge: 'ha de ser més gran que zero' });
    }
    if (preuVenda !== null && Number.isNaN(preuVenda)) {
      errors.push({ fila, camp: 'preuVenda', missatge: 'ha de ser un número (o buit)' });
    } else if (preuVenda !== null && preuVenda < 0) {
      errors.push({ fila, camp: 'preuVenda', missatge: 'no pot ser negatiu' });
    }

    if (!codi) continue; // sin codi no hay con qué deduplicar ni upsertear — ya quedó en errors
    if (errors.length > errorsAbans) continue; // esta fila tuvo algún error — no es "válida"

    if (porCodi.has(codi)) duplicats.push({ fila, codi });
    porCodi.set(codi, {
      fila,
      codi,
      descripcio,
      categoriaNom,
      agrupacioProduccio,
      format: formatBrut || null,
      envasat: envasatBrut || null,
      pesKg: pesKg !== null && !Number.isNaN(pesKg) ? pesKg : null,
      preuVenda: preuVenda !== null && !Number.isNaN(preuVenda) ? preuVenda : null,
    });
  }

  return { valides: [...porCodi.values()], errors, duplicats };
}

async function main(): Promise<void> {
  const files = await leerHojaXlsx(ARXIU_ENTRADA);

  const categoriesRes = await pool.query<{ id: string; nom: string }>(
    'SELECT id, nom FROM categoria_producte',
  );
  const categoriesValides = new Set(categoriesRes.rows.map((r) => r.nom));
  const categoriaIdPorNom = new Map(categoriesRes.rows.map((r) => [r.nom, r.id]));

  const { valides, errors, duplicats } = validarArticles(files, categoriesValides);

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
    for (const art of valides) {
      const categoriaId = categoriaIdPorNom.get(art.categoriaNom)!;
      const resultat = await client.query<{ es_nou: boolean }>(
        `INSERT INTO producte (codi, descripcio, categoria_id, agrupacio_produccio, format, envasat, pes_kg, preu_venda)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (codi) WHERE codi IS NOT NULL DO UPDATE SET
           descripcio = EXCLUDED.descripcio,
           categoria_id = EXCLUDED.categoria_id,
           agrupacio_produccio = EXCLUDED.agrupacio_produccio,
           format = EXCLUDED.format,
           envasat = EXCLUDED.envasat,
           pes_kg = EXCLUDED.pes_kg,
           preu_venda = EXCLUDED.preu_venda
         RETURNING (xmax = 0) AS es_nou`,
        [
          art.codi,
          art.descripcio,
          categoriaId,
          art.agrupacioProduccio,
          art.format,
          art.envasat,
          art.pesKg,
          art.preuVenda,
        ],
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

// Guarda de "¿me están ejecutando directo?" (mismo patrón que db/migrate.ts)
// — necesaria acá porque, a diferencia de seed-arranque.ts, este archivo
// también se importa desde el test de validación (validarArticles) y desde
// generar-dades-exemple.ts; sin esto, importarlo dispararía main() solo.
const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  main()
    .catch((err: unknown) => {
      logger.error({ err }, "La importació d'articles va fallar — res es va escriure (ROLLBACK)");
      process.exitCode = 1;
    })
    .finally(() => cerrarPool());
}
