import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { migrarArriba } from '../../db/migrate.js';
import { comprovarIntegritatPostEsborrat, netejarCargaInicial } from './reset-carga-inicial.js';

const confirmarSi = (): Promise<boolean> => Promise.resolve(true);
const confirmarNo = (): Promise<boolean> => Promise.resolve(false);

/**
 * Esquema NUEVO por test (no compartido) — netejarCargaInicial() es
 * deliberadamente destructivo sobre toda la tabla, así que dos tests no
 * pueden convivir en el mismo esquema sin que uno contamine el recuento
 * del otro.
 */
describe('netejarCargaInicial (Postgres real, esquema aislado por test)', () => {
  let esquema: string;
  let poolTest: Pool;

  beforeEach(async () => {
    esquema = `test_reset_carga_${randomUUID().replaceAll('-', '_')}`;
    const setup = new Client({ connectionString: env.DATABASE_URL });
    await setup.connect();
    await setup.query(`CREATE SCHEMA "${esquema}"`);
    await setup.query(`SET search_path TO "${esquema}"`);
    await migrarArriba(setup);
    // origen_comanda no lo siembra la migración (sólo seed-arranque.ts) —
    // hace falta para poder crear una comanda de fixture (origen_id NOT NULL).
    await setup.query(
      `INSERT INTO origen_comanda (codi, nom) VALUES ('woocommerce', 'WooCommerce'), ('manual', 'Manual')`,
    );
    await setup.end();

    poolTest = new Pool({
      connectionString: env.DATABASE_URL,
      options: `-c search_path=${esquema}`,
    });
  });

  afterEach(async () => {
    await poolTest.end();
    const cleanup = new Client({ connectionString: env.DATABASE_URL });
    await cleanup.connect();
    await cleanup.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await cleanup.end();
  });

  it('producte con alias_producte asociado (sin comanda_linia): ambos se borran sin error', async () => {
    const producte = await poolTest.query<{ id: string }>(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('P01', 'Producte de prova', 'simple') RETURNING id`,
    );
    await poolTest.query(
      `INSERT INTO alias_producte (producte_id, woo_product_id, woo_variation_id, idioma, codi)
       VALUES ($1, 1, 0, 'ca', 'P01')`,
      [producte.rows[0]!.id],
    );

    const resultat = await netejarCargaInicial(poolTest, confirmarSi);

    expect(resultat.feta).toBe(true);
    if (!resultat.feta) throw new Error('inesperat: feta hauria de ser true');
    expect(resultat.recompte.productesEsborrats).toBe(1);
    expect(resultat.recompte.aliasProducteEsborrats).toBe(1);

    const productes = await poolTest.query<{ count: string }>('SELECT count(*) FROM producte');
    const alies = await poolTest.query<{ count: string }>('SELECT count(*) FROM alias_producte');
    expect(Number(productes.rows[0]?.count)).toBe(0);
    expect(Number(alies.rows[0]?.count)).toBe(0);
  });

  it('producte con rendiments_porcs asociado (sin comanda_linia): ambos se borran sin error', async () => {
    const categoria = await poolTest.query<{ id: string }>(
      `INSERT INTO categoria_producte (nom, elaborat_porc, agrupacio_rendiment)
       VALUES ('Categoria de prova KG', true, 'KG') RETURNING id`,
    );
    const producte = await poolTest.query<{ id: string }>(
      `INSERT INTO producte (codi, descripcio, tipus, categoria_id)
       VALUES ('P02', 'Producte amb rendiment', 'simple', $1) RETURNING id`,
      [categoria.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO rendiments_porcs (producte_id, unitats_per_porc, kg_per_unitat) VALUES ($1, '2.00', '3.500')`,
      [producte.rows[0]!.id],
    );

    const resultat = await netejarCargaInicial(poolTest, confirmarSi);

    expect(resultat.feta).toBe(true);
    if (!resultat.feta) throw new Error('inesperat: feta hauria de ser true');
    expect(resultat.recompte.productesEsborrats).toBe(1);
    expect(resultat.recompte.rendimentsPorcsEsborrats).toBe(1);
  });

  it('producte protegido (con comanda_linia real) conserva su alias_producte — no se toca', async () => {
    const producte = await poolTest.query<{ id: string }>(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('P03', 'Producte protegit', 'simple') RETURNING id`,
    );
    await poolTest.query(
      `INSERT INTO alias_producte (producte_id, woo_product_id, woo_variation_id, idioma, codi)
       VALUES ($1, 2, 0, 'ca', 'P03')`,
      [producte.rows[0]!.id],
    );
    const comanda = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda (origen_id, estat)
       VALUES ((SELECT id FROM origen_comanda WHERE codi = 'manual'), 'oberta') RETURNING id`,
    );
    await poolTest.query(
      `INSERT INTO comanda_linia (comanda_id, ordinal, producte_id, unitats_demanades, preu_unitari, pes_calculat_kg)
       VALUES ($1, 0, $2, 1, '0.00', '1.000')`,
      [comanda.rows[0]!.id, producte.rows[0]!.id],
    );

    const resultat = await netejarCargaInicial(poolTest, confirmarSi);

    // Nada que borrar: el único producte que existe está protegido.
    expect(resultat).toMatchObject({ feta: false, motiu: 'res_per_esborrar' });

    const productes = await poolTest.query<{ count: string }>('SELECT count(*) FROM producte');
    const alies = await poolTest.query<{ count: string }>('SELECT count(*) FROM alias_producte');
    expect(Number(productes.rows[0]?.count)).toBe(1);
    expect(Number(alies.rows[0]?.count)).toBe(1);
  });

  it('tarifa asignada a un client protegido (sin comanda.tarifa_id directo) queda protegida', async () => {
    const tarifaProtegidaPerClient = await poolTest.query<{ id: string }>(
      `INSERT INTO tarifa (codi, nom) VALUES ('TP01', 'Tarifa protegida per client') RETURNING id`,
    );
    await poolTest.query(`INSERT INTO tarifa (codi, nom) VALUES ('TS01', 'Tarifa sense ús')`);
    const client = await poolTest.query<{ id: string }>(
      `INSERT INTO client (codi, nom, poblacio, tarifa_id) VALUES ('C01', 'Client real', 'Manresa', $1) RETURNING id`,
      [tarifaProtegidaPerClient.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO comanda (origen_id, estat, client_id)
       VALUES ((SELECT id FROM origen_comanda WHERE codi = 'manual'), 'oberta', $1)`,
      [client.rows[0]!.id],
    );

    const resultat = await netejarCargaInicial(poolTest, confirmarSi);

    expect(resultat.feta).toBe(true);
    if (!resultat.feta) throw new Error('inesperat: feta hauria de ser true');
    expect(resultat.proteccions.tarifes.map((t) => t.codi)).toEqual(['TP01']);
    expect(resultat.recompte.tarifesEsborrades).toBe(1); // sólo TS01

    const tarifaQueSubsisteix = await poolTest.query('SELECT id FROM tarifa WHERE codi = $1', [
      'TP01',
    ]);
    expect(tarifaQueSubsisteix.rows).toHaveLength(1);
    const tarifaBorrada = await poolTest.query('SELECT id FROM tarifa WHERE codi = $1', ['TS01']);
    expect(tarifaBorrada.rows).toHaveLength(0);

    // El client sigue existiendo y con su tarifa_id intacto — no se nuleó.
    const clientRestant = await poolTest.query<{ tarifa_id: string | null }>(
      'SELECT tarifa_id FROM client WHERE codi = $1',
      ['C01'],
    );
    expect(clientRestant.rows[0]?.tarifa_id).toBe(tarifaProtegidaPerClient.rows[0]!.id);
  });

  it('confirmar=false: no borra nada, motiu cancellat', async () => {
    await poolTest.query(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('P04', 'X', 'simple')`,
    );

    const resultat = await netejarCargaInicial(poolTest, confirmarNo);

    expect(resultat).toMatchObject({ feta: false, motiu: 'cancellat' });
    const total = await poolTest.query<{ count: string }>('SELECT count(*) FROM producte');
    expect(Number(total.rows[0]?.count)).toBe(1);
  });

  it('esquema vacío: no llama a confirmar, motiu res_per_esborrar', async () => {
    let confirmarCridat = false;
    const resultat = await netejarCargaInicial(poolTest, () => {
      confirmarCridat = true;
      return Promise.resolve(true);
    });

    expect(resultat).toMatchObject({ feta: false, motiu: 'res_per_esborrar' });
    expect(confirmarCridat).toBe(false);
  });

  /**
   * NO existe una forma realista de forzar un huérfano de verdad para
   * probar la rama de fallo de este chequeo: las 4 FK que verifica
   * (comanda.client_id/tarifa_id, comanda_linia.producte_id/
   * alias_producte_id) son NO ACTION/RESTRICT por default de Postgres, sin
   * DEFERRABLE — el propio DELETE del reset ya falla con un 23503 (ver el
   * catch de esborrar()) ANTES de poder dejar una fila así. Forzarlo
   * exigiría desactivar las FK a mano (ALTER TABLE ... DISABLE TRIGGER ALL,
   * o similar), lo que no probaría el chequeo en sí, sólo que Postgres deja
   * de aplicar sus propias constraints si uno se lo pide explícitamente —
   * no es un escenario real. Por eso, siguiendo lo que decía el pedido,
   * este test cubre el caso normal: que la consulta corre, cubre las 4
   * relaciones, y da 0 cuando el dato es consistente (que es la garantía
   * real: nunca puede dar otra cosa mientras las FK sigan intactas).
   */
  it('chequeo de integridad post-borrado: corre las 4 comprobaciones y da 0 en un estado consistente', async () => {
    const producte = await poolTest.query<{ id: string }>(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('P05', 'Producte protegit', 'simple') RETURNING id`,
    );
    const client = await poolTest.query<{ id: string }>(
      `INSERT INTO client (codi, nom, poblacio) VALUES ('C02', 'Client protegit', 'Manresa') RETURNING id`,
    );
    const comanda = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda (origen_id, estat, client_id)
       VALUES ((SELECT id FROM origen_comanda WHERE codi = 'manual'), 'oberta', $1) RETURNING id`,
      [client.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO comanda_linia (comanda_id, ordinal, producte_id, unitats_demanades, preu_unitari, pes_calculat_kg)
       VALUES ($1, 0, $2, 1, '0.00', '1.000')`,
      [comanda.rows[0]!.id, producte.rows[0]!.id],
    );

    const dbClient = await poolTest.connect();
    try {
      const comprovacio = await comprovarIntegritatPostEsborrat(dbClient);

      expect(comprovacio).toHaveLength(4);
      expect(comprovacio.map((c) => `${c.taula}.${c.columna}`)).toEqual([
        'comanda.client_id',
        'comanda.tarifa_id',
        'comanda_linia.producte_id',
        'comanda_linia.alias_producte_id',
      ]);
      expect(comprovacio.every((c) => c.orfes === 0)).toBe(true);
    } finally {
      dbClient.release();
    }
  });

  it('flujo completo con datos protegidos Y no protegidos mezclados: el chequeo no bloquea un COMMIT legítimo', async () => {
    // Protegido: sobrevive.
    const producteProtegit = await poolTest.query<{ id: string }>(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('P06', 'Protegit', 'simple') RETURNING id`,
    );
    const clientProtegit = await poolTest.query<{ id: string }>(
      `INSERT INTO client (codi, nom, poblacio) VALUES ('C03', 'Protegit', 'Manresa') RETURNING id`,
    );
    const comanda = await poolTest.query<{ id: string }>(
      `INSERT INTO comanda (origen_id, estat, client_id)
       VALUES ((SELECT id FROM origen_comanda WHERE codi = 'manual'), 'oberta', $1) RETURNING id`,
      [clientProtegit.rows[0]!.id],
    );
    await poolTest.query(
      `INSERT INTO comanda_linia (comanda_id, ordinal, producte_id, unitats_demanades, preu_unitari, pes_calculat_kg)
       VALUES ($1, 0, $2, 1, '0.00', '1.000')`,
      [comanda.rows[0]!.id, producteProtegit.rows[0]!.id],
    );

    // No protegido: se borra.
    await poolTest.query(
      `INSERT INTO producte (codi, descripcio, tipus) VALUES ('P07', 'No protegit', 'simple')`,
    );
    await poolTest.query(
      `INSERT INTO client (codi, nom, poblacio) VALUES ('C04', 'No protegit', 'Vic')`,
    );

    const resultat = await netejarCargaInicial(poolTest, confirmarSi);

    expect(resultat.feta).toBe(true);
    if (!resultat.feta) throw new Error('inesperat: feta hauria de ser true');
    expect(resultat.recompte.productesEsborrats).toBe(1);
    expect(resultat.recompte.clientsEsborrats).toBe(1);

    const productes = await poolTest.query('SELECT codi FROM producte');
    expect(productes.rows.map((r: { codi: string }) => r.codi)).toEqual(['P06']);
  });
});
