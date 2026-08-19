/**
 * Seed de datos de arranque — autorizado por el cliente (Francesc),
 * confirmado el 18/08/2026. Carga las categorías y los orígenes de pedido
 * mínimos para poder arrancar mientras llegan los datos reales del
 * cliente en el cut-over — son reemplazables sin drama, NO son la fuente
 * de verdad final. Vienen del prototipo de Lovable.
 *
 * A diferencia de netejar-historic-desenvolupament.ts, este script no
 * rechaza correr en producción a propósito: se piensa usar también contra
 * Cloud SQL real durante el cut-over, no sólo en desarrollo local.
 *
 * UPSERT por `nom` (categorías) / `codi` (orígenes de pedido): correrlo
 * más de una vez no duplica nada.
 *
 * Uso: tsx --env-file-if-exists=../../.env src/scripts/seed-arranque.ts
 */
import type { PoolClient } from 'pg';
import { cerrarPool, pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';

interface CategoriaSeed {
  nom: string;
  elaboratPorc: boolean;
  agrupacioRendiment: 'KG' | 'MAGRE' | 'PAQ' | null;
}

// Datos del prototipo de Lovable, autorizados por Francesc el 18/08/2026
// para arrancar mientras llegan los datos reales del cliente.
const CATEGORIES: CategoriaSeed[] = [
  { nom: 'ELABORAT CUIT', elaboratPorc: false, agrupacioRendiment: null },
  { nom: 'ELABORAT CURAT', elaboratPorc: false, agrupacioRendiment: null },
  { nom: 'ELABORAT FRESC', elaboratPorc: true, agrupacioRendiment: 'MAGRE' },
  { nom: 'ELABORAT FUMAT', elaboratPorc: false, agrupacioRendiment: null },
  { nom: 'PECES MAGRES', elaboratPorc: true, agrupacioRendiment: 'MAGRE' },
  { nom: 'PECES NOBLES KG', elaboratPorc: true, agrupacioRendiment: 'KG' },
  { nom: 'PECES NOBLES PAQ', elaboratPorc: true, agrupacioRendiment: 'PAQ' },
  { nom: 'VÍSCERES', elaboratPorc: false, agrupacioRendiment: null },
];

interface OrigenComandaSeed {
  codi: string;
  nom: string;
  actiu: boolean;
}

const ORIGENS_COMANDA: OrigenComandaSeed[] = [
  { codi: 'woocommerce', nom: 'WooCommerce', actiu: true },
  { codi: 'manual', nom: 'Manual', actiu: true },
];

async function sembrarCategories(client: PoolClient): Promise<void> {
  for (const c of CATEGORIES) {
    await client.query(
      `INSERT INTO categoria_producte (nom, elaborat_porc, agrupacio_rendiment)
       VALUES ($1, $2, $3)
       ON CONFLICT (nom) DO UPDATE SET
         elaborat_porc = EXCLUDED.elaborat_porc,
         agrupacio_rendiment = EXCLUDED.agrupacio_rendiment`,
      [c.nom, c.elaboratPorc, c.agrupacioRendiment],
    );
  }
}

async function sembrarOrigensComanda(client: PoolClient): Promise<void> {
  for (const o of ORIGENS_COMANDA) {
    await client.query(
      `INSERT INTO origen_comanda (codi, nom, actiu)
       VALUES ($1, $2, $3)
       ON CONFLICT (codi) DO UPDATE SET nom = EXCLUDED.nom, actiu = EXCLUDED.actiu`,
      [o.codi, o.nom, o.actiu],
    );
  }
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await sembrarCategories(client);
    await sembrarOrigensComanda(client);
    await client.query('COMMIT');

    console.log({
      categoriesCarregades: CATEGORIES.length,
      origensComandaCarregats: ORIGENS_COMANDA.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'El seed de arranque falló — nada se cargó (ROLLBACK)');
    process.exitCode = 1;
  })
  .finally(() => cerrarPool());
