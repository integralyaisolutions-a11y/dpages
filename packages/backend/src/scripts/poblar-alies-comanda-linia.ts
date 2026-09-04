/**
 * Capa 50 — de un solo uso, diagnóstico/reparación puntual. NO se despliega
 * a Cloud Run, sin script en package.json (mismo criterio que el resto de
 * `scripts/`, ver README.md de la carpeta).
 *
 * Contexto: 97 SKUs de líneas de pedido reales (`comanda_linia`) quedaron
 * sin `producte_id` porque falta el `alias_producte` correspondiente
 * (ADR-008) — aunque el `producte` ya existe en nuestro catálogo con el
 * mismo `codi`. La razón más probable: la línea se transformó ANTES de que
 * ese `producte` existiera (carga inicial, alta manual), y
 * `comanda_linia.producte_id` sólo se re-resuelve cuando el PEDIDO entero
 * se vuelve a transformar (ADR-004, guardián de versión) — un pedido viejo
 * que no se vuelve a tocar en WooCommerce se queda con `producte_id = NULL`
 * para siempre, aunque hoy `resolverArticle` sí lo resolvería.
 *
 * Reusa `resolverArticle` (transform/resolucio-article.ts) — la MISMA
 * función que usa el sync normal — para la fase de re-procesamiento, en vez
 * de reimplementar la lógica de resolución acá.
 *
 * DOS niveles de confirmación explícita, cada uno con su propio flag:
 *   --aplicar        aplica los matches EXACTOS (codi = woo_sku, byte a
 *                     byte). Sin este flag, sólo imprime (dry-run).
 *   --incluir-fuzzy   además de los exactos, aplica los matches por
 *                     trim/case-insensitive — requiere HABER REVISADO la
 *                     lista impresa primero: un SKU parecido puede ser un
 *                     producto distinto. Sin --aplicar, no hace nada de
 *                     todos modos (sigue siendo dry-run).
 *
 * Nunca crea un `producte` nuevo — sólo vincula alias donde el producto YA
 * existe. Si no se puede determinar el idioma (falta el JSON crudo del
 * producto en `aterratge_woocommerce`), NO crea el alias para ese caso —
 * se reporta aparte, no se inventa un idioma por defecto silencioso (a
 * diferencia de `inferirIdiomaHeuristic`, que sí cae a un default cuando el
 * dato crudo existe pero la categoría no está en la heurística — acá el
 * problema es más grave: no hay dato crudo en absoluto).
 *
 * Uso:
 *   tsx --env-file-if-exists=../../.env src/scripts/poblar-alies-comanda-linia.ts
 *   tsx --env-file-if-exists=../../.env src/scripts/poblar-alies-comanda-linia.ts --aplicar
 *   tsx --env-file-if-exists=../../.env src/scripts/poblar-alies-comanda-linia.ts --aplicar --incluir-fuzzy
 */
import { pathToFileURL } from 'node:url';
import type { PoolClient } from 'pg';
import type { WooProduct } from '@dpages/shared';
import { cerrarPool, pool as poolPerDefecte } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { calcularPesLinia } from '../transform/pes.js';
import { resolverArticle } from '../transform/resolucio-article.js';
import { inferirIdiomaHeuristic } from '../transform/idioma.js';

interface Candidat {
  wooProductId: number;
  wooVariationId: number;
  wooSku: string;
  liniesAfectades: number;
}

type TipusMatch = 'exacte' | 'aproximat' | 'sense_producte';

interface ProducteTrobat {
  id: string;
  codi: string;
}

interface ResultatCandidat extends Candidat {
  tipus: TipusMatch;
  producte: ProducteTrobat | null;
  idioma: 'ca' | 'es' | null;
  motivoSenseIdioma: string | null;
}

async function obtenirCandidats(client: PoolClient): Promise<Candidat[]> {
  const res = await client.query<{
    woo_product_id: string;
    woo_variation_id: string;
    woo_sku: string;
    linies_afectades: string;
  }>(
    `SELECT woo_product_id, woo_variation_id, woo_sku, count(*) AS linies_afectades
     FROM comanda_linia
     WHERE producte_id IS NULL AND woo_sku IS NOT NULL AND NOT esborrat
     GROUP BY woo_product_id, woo_variation_id, woo_sku
     ORDER BY woo_sku`,
  );
  return res.rows.map((f) => ({
    wooProductId: Number(f.woo_product_id),
    wooVariationId: Number(f.woo_variation_id),
    wooSku: f.woo_sku,
    liniesAfectades: Number(f.linies_afectades),
  }));
}

/** Match EXACTO, byte a byte — mismo criterio que el paso 3 de resolverArticle. */
async function buscarProducteExacte(
  client: PoolClient,
  wooSku: string,
): Promise<ProducteTrobat | null> {
  const res = await client.query<ProducteTrobat>('SELECT id, codi FROM producte WHERE codi = $1', [
    wooSku,
  ]);
  return res.rows[0] ?? null;
}

/**
 * Match por trim + case-insensitive — NO es lo que usa resolverArticle (ese
 * exige igualdad exacta), así que un producto encontrado acá NUNCA
 * resolvería solo con reprocesar: hace falta el alias sí o sí. Requiere
 * revisión humana antes de confirmar — un SKU "parecido" puede ser, en
 * realidad, un producto distinto (ej. una talla/variante con nombre similar).
 */
async function buscarProducteAproximat(
  client: PoolClient,
  wooSku: string,
): Promise<ProducteTrobat | null> {
  const res = await client.query<ProducteTrobat>(
    `SELECT id, codi FROM producte
     WHERE codi IS NOT NULL AND LOWER(TRIM(codi)) = LOWER(TRIM($1)) AND codi <> $1`,
    [wooSku],
  );
  return res.rows[0] ?? null;
}

/**
 * El idioma de un alias se infiere del JSON crudo del producto
 * (`aterratge_woocommerce`, recurs='products') — mismo mecanismo que usa
 * `transformarCataleg` en el sync normal (`inferirIdiomaHeuristic`). Si ese
 * producto nunca se aterrizó (no está en nuestra copia cruda), no hay de
 * dónde inferir nada — a diferencia de una categoría no reconocida (que sí
 * cae a un default), acá directamente no se puede intentar.
 */
async function inferirIdiomaDesdeAterratge(
  client: PoolClient,
  wooProductId: number,
): Promise<{ idioma: 'ca' | 'es' } | { error: string }> {
  const res = await client.query<{ payload: WooProduct }>(
    `SELECT payload FROM aterratge_woocommerce WHERE recurs = 'products' AND woo_id = $1`,
    [wooProductId],
  );
  const crudo = res.rows[0]?.payload;
  if (!crudo) {
    return {
      error: `no hay JSON crudo de este producto en aterratge_woocommerce (nunca se aterrizó vía sync-cataleg)`,
    };
  }
  return { idioma: inferirIdiomaHeuristic(crudo) };
}

async function clasificarCandidats(
  client: PoolClient,
  candidats: Candidat[],
): Promise<ResultatCandidat[]> {
  const resultats: ResultatCandidat[] = [];

  for (const candidat of candidats) {
    const exacte = await buscarProducteExacte(client, candidat.wooSku);
    if (exacte) {
      const idiomaRes = await inferirIdiomaDesdeAterratge(client, candidat.wooProductId);
      resultats.push({
        ...candidat,
        tipus: 'exacte',
        producte: exacte,
        idioma: 'idioma' in idiomaRes ? idiomaRes.idioma : null,
        motivoSenseIdioma: 'error' in idiomaRes ? idiomaRes.error : null,
      });
      continue;
    }

    const aproximat = await buscarProducteAproximat(client, candidat.wooSku);
    if (aproximat) {
      const idiomaRes = await inferirIdiomaDesdeAterratge(client, candidat.wooProductId);
      resultats.push({
        ...candidat,
        tipus: 'aproximat',
        producte: aproximat,
        idioma: 'idioma' in idiomaRes ? idiomaRes.idioma : null,
        motivoSenseIdioma: 'error' in idiomaRes ? idiomaRes.error : null,
      });
      continue;
    }

    resultats.push({
      ...candidat,
      tipus: 'sense_producte',
      producte: null,
      idioma: null,
      motivoSenseIdioma: null,
    });
  }

  return resultats;
}

function imprimirInforme(resultats: ResultatCandidat[]): void {
  const exactos = resultats.filter((r) => r.tipus === 'exacte');
  const aproximados = resultats.filter((r) => r.tipus === 'aproximat');
  const sinProducto = resultats.filter((r) => r.tipus === 'sense_producte');
  const sinIdioma = resultats.filter((r) => r.producte && r.idioma === null);

  console.log(`\n=== ${resultats.length} SKU distintos sin resolver, con woo_sku informado ===\n`);

  console.log(`--- Match EXACTO (codi = woo_sku), ${exactos.length} ---`);
  for (const r of exactos) {
    const idiomaTxt = r.idioma ? `idioma=${r.idioma}` : `SIN IDIOMA (${r.motivoSenseIdioma})`;
    console.log(
      `  woo_sku="${r.wooSku}" woo_product_id=${r.wooProductId} woo_variation_id=${r.wooVariationId} ` +
        `-> producte.id=${r.producte!.id} codi="${r.producte!.codi}" ${idiomaTxt} ` +
        `(${r.liniesAfectades} línia(s))`,
    );
  }

  console.log(
    `\n--- Match APROXIMADO — REVISAR CON CUIDADO, podría ser un producto distinto, ${aproximados.length} ---`,
  );
  for (const r of aproximados) {
    const idiomaTxt = r.idioma ? `idioma=${r.idioma}` : `SIN IDIOMA (${r.motivoSenseIdioma})`;
    console.log(
      `  woo_sku="${r.wooSku}" (WooCommerce) <> codi="${r.producte!.codi}" (nuestro) ` +
        `woo_product_id=${r.wooProductId} woo_variation_id=${r.wooVariationId} ` +
        `-> producte.id=${r.producte!.id} ${idiomaTxt} (${r.liniesAfectades} línia(s))`,
    );
  }

  console.log(
    `\n--- SIN producte en nuestro catálogo, ${sinProducto.length} (no se puede hacer nada acá) ---`,
  );
  for (const r of sinProducto) {
    console.log(
      `  woo_sku="${r.wooSku}" woo_product_id=${r.wooProductId} (${r.liniesAfectades} línia(s))`,
    );
  }

  console.log(`\n=== Resumen ===`);
  console.log(`  Exactos con idioma resoluble:      ${exactos.filter((r) => r.idioma).length}`);
  console.log(`  Aproximados con idioma resoluble:  ${aproximados.filter((r) => r.idioma).length}`);
  console.log(`  Sin idioma resoluble (cualquiera): ${sinIdioma.length}`);
  console.log(`  Sin producto en el catálogo:       ${sinProducto.length}`);
  console.log(
    `  Total líneas de comanda_linia cubiertas por los que SÍ tienen producto+idioma: ${resultats
      .filter((r) => r.producte && r.idioma)
      .reduce((acc, r) => acc + r.liniesAfectades, 0)}\n`,
  );
}

/** Ya existe un alias para este (woo_product_id, woo_variation_id) — no duplicar (UNIQUE de la tabla). */
async function existeAlias(
  client: PoolClient,
  wooProductId: number,
  wooVariationId: number,
): Promise<boolean> {
  const res = await client.query(
    'SELECT 1 FROM alias_producte WHERE woo_product_id = $1 AND woo_variation_id = $2',
    [wooProductId, wooVariationId],
  );
  return (res.rowCount ?? 0) > 0;
}

async function crearAlias(client: PoolClient, r: ResultatCandidat): Promise<void> {
  if (!r.producte || !r.idioma) return;
  if (await existeAlias(client, r.wooProductId, r.wooVariationId)) return;

  console.log(
    `  Creando alias: woo_sku="${r.wooSku}" woo_product_id=${r.wooProductId} woo_variation_id=${r.wooVariationId} -> producte.id=${r.producte.id} idioma=${r.idioma}`,
  );
  await client.query(
    `INSERT INTO alias_producte (producte_id, woo_product_id, woo_variation_id, idioma, codi)
     VALUES ($1, $2, $3, $4, $5)`,
    [r.producte.id, r.wooProductId, r.wooVariationId, r.idioma, r.wooSku],
  );
}

/** Cada cuántas líneas se loguea el progreso dentro de reprocesarLinies. */
const PROGRES_CADA_N_LINIES = 50;

interface FilaLiniaAfectada {
  id: string;
  woo_product_id: string;
  woo_variation_id: string;
  woo_sku: string | null;
  unitats_demanades: string;
}

/**
 * Reprocesa sólo las líneas cuyo woo_sku tiene un producte encontrado
 * (`skusRellevants` = los SKU de `aAplicar` en main(), el mismo filtro que
 * ya decide a quién se le crea alias). Acotar por SKU alcanza — el paso 3
 * de resolverArticle matchea por SKU directo contra producte.codi, sin
 * importar el alias — así que una línea cuyo woo_sku NO está en esta lista
 * (los SKU "sin producto") NUNCA va a resolver, con o sin alias: recorrerla
 * es trabajo puro desperdiciado. Encontrado en producción real: con las 179
 * SKU sin filtrar (miles de líneas, la mayoría sin producto), el script
 * tardaba varios minutos sin ningún output — cada línea hace hasta 3
 * round-trips secuenciales contra Cloud SQL por la red.
 *
 * Reusa `resolverArticle`, la MISMA función del sync normal — si ahora
 * resuelve, actualiza producte_id/alias_producte_id y recalcula el peso,
 * igual que `processarLinies` en transform/comandes.ts.
 */
async function reprocesarLinies(
  client: PoolClient,
  aplicar: boolean,
  skusRellevants: readonly string[],
): Promise<number> {
  const linies = await client.query<FilaLiniaAfectada>(
    `SELECT id, woo_product_id, woo_variation_id, woo_sku, unitats_demanades
     FROM comanda_linia
     WHERE producte_id IS NULL AND woo_sku = ANY($1::text[]) AND NOT esborrat`,
    [skusRellevants],
  );
  console.log(
    `Reprocesando ${linies.rowCount} línia(s) (filtradas a los SKU con producte encontrado)...`,
  );

  let resueltas = 0;
  let procesadas = 0;
  for (const linia of linies.rows) {
    procesadas++;
    const resolucio = await resolverArticle(
      client,
      Number(linia.woo_product_id),
      Number(linia.woo_variation_id),
      linia.woo_sku,
    );
    if (!resolucio) continue;
    resueltas++;

    if (!aplicar) continue;

    const producte = await client.query<{ pes_kg: string | null }>(
      'SELECT pes_kg FROM producte WHERE id = $1',
      [resolucio.producteId],
    );
    const pes = calcularPesLinia(Number(linia.unitats_demanades), producte.rows[0]?.pes_kg ?? null);

    await client.query(
      `UPDATE comanda_linia SET
         producte_id = $2, alias_producte_id = $3,
         pes_fitxa_kg = $4, pes_calculat_kg = $5, pes_editable = $6
       WHERE id = $1`,
      [
        linia.id,
        resolucio.producteId,
        resolucio.aliasProducteId,
        pes.pesFitxaKg,
        pes.pesCalculatKg,
        pes.pesEditable,
      ],
    );

    if (procesadas % PROGRES_CADA_N_LINIES === 0) {
      console.log(
        `  ...${procesadas}/${linies.rowCount} línies revisades (${resueltas} resoltes fins ara).`,
      );
    }
  }

  console.log(`Reprocesament acabat: ${resueltas}/${procesadas} línies resoltes.`);
  return resueltas;
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const incluirFuzzy = process.argv.includes('--incluir-fuzzy');

  const client = await poolPerDefecte.connect();
  try {
    const candidats = await obtenirCandidats(client);
    const resultats = await clasificarCandidats(client, candidats);
    imprimirInforme(resultats);

    if (!aplicar) {
      console.log(
        'Modo DRY-RUN (default) — no se escribió nada. Correr con --aplicar para aplicar los matches EXACTOS.',
      );
      return;
    }

    console.log(
      incluirFuzzy
        ? '--aplicar --incluir-fuzzy: aplicando matches EXACTOS y APROXIMADOS...'
        : '--aplicar: aplicando sólo matches EXACTOS (usar --incluir-fuzzy para incluir los aproximados, después de revisarlos)...',
    );

    await client.query('BEGIN');
    try {
      const aAplicar = resultats.filter(
        (r) =>
          r.producte &&
          r.idioma &&
          (r.tipus === 'exacte' || (r.tipus === 'aproximat' && incluirFuzzy)),
      );
      for (const r of aAplicar) {
        await crearAlias(client, r);
      }
      const skusRellevants = [...new Set(aAplicar.map((r) => r.wooSku))];
      const resueltas = await reprocesarLinies(client, true, skusRellevants);
      await client.query('COMMIT');

      console.log(`Aliases creados/confirmados: ${aAplicar.length}.`);
      console.log(`Líneas de comanda_linia resueltas: ${resueltas}.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}

const esEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntryPoint) {
  main()
    .catch((err: unknown) => {
      logger.error({ err }, 'poblar-alies-comanda-linia falló');
      process.exitCode = 1;
    })
    .finally(() => cerrarPool());
}

export {
  obtenirCandidats,
  clasificarCandidats,
  crearAlias,
  existeAlias,
  reprocesarLinies,
  type ResultatCandidat,
};
