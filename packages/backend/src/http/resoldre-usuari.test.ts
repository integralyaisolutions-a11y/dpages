import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { migrarArriba } from '../db/migrate.js';
import type { InfoUsuari } from './auth-firebase.js';
import { crearMiddlewareResoldreUsuari } from './resoldre-usuari.js';

function crearReqFake(usuari: InfoUsuari): FastifyRequest {
  return { usuari } as FastifyRequest;
}

function crearReplyFake(): FastifyReply & { codigo?: number; cuerpo?: unknown } {
  const reply = {
    code(codigo: number) {
      reply.codigo = codigo;
      return reply;
    },
    send(cuerpo: unknown) {
      reply.cuerpo = cuerpo;
      return reply;
    },
  } as FastifyReply & { codigo?: number; cuerpo?: unknown };
  return reply;
}

/**
 * Mismo patrón que auth-firebase.test.ts (req/reply simulados, sin pasar
 * por HTTP) — pero a diferencia del verificador de token, este middleware sí
 * necesita Postgres real (auto-provisioning), así que corre contra un
 * esquema aislado, igual que el resto de los tests de integración.
 */
describe('crearMiddlewareResoldreUsuari (Postgres real, esquema aislado)', () => {
  const esquema = `test_resoldre_usuari_${randomUUID().replaceAll('-', '_')}`;
  let poolTest: Pool;

  beforeAll(async () => {
    const setup = new Client({ connectionString: env.DATABASE_URL });
    await setup.connect();
    await setup.query(`CREATE SCHEMA "${esquema}"`);
    await setup.query(`SET search_path TO "${esquema}"`);
    await migrarArriba(setup);
    await setup.end();

    poolTest = new Pool({
      connectionString: env.DATABASE_URL,
      options: `-c search_path=${esquema}`,
    });
  });

  afterAll(async () => {
    await poolTest.end();
    const cleanup = new Client({ connectionString: env.DATABASE_URL });
    await cleanup.connect();
    await cleanup.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await cleanup.end();
  });

  it('uid nunca visto: auto-provisiona con el rol General, NO Administrador', async () => {
    const req = crearReqFake({
      uid: 'uid-nou-1',
      rol: null,
      email: 'nou@dpages.cat',
      nom: 'Usuari Nou',
    });
    const reply = crearReplyFake();

    await crearMiddlewareResoldreUsuari(poolTest)(req, reply);

    expect(reply.codigo).toBeUndefined();
    expect(req.usuariResolt).toMatchObject({
      firebaseUid: 'uid-nou-1',
      nom: 'Usuari Nou',
      email: 'nou@dpages.cat',
      actiu: true,
      rol: { nom: 'General' },
    });
    expect(req.usuariResolt?.rol.modulsPermesos).toContain('comandes');
    // El punto del cambio: nadie obtiene gestión de usuarios/roles sólo por
    // loguearse primero — eso se otorga a mano (PATCH /usuaris/:id).
    expect(req.usuariResolt?.rol.modulsPermesos).not.toContain('usuaris');
    expect(req.usuariResolt?.rol.modulsPermesos).not.toContain('rols');
    expect(req.usuariResolt?.id).toBeGreaterThan(0);
  });

  it('el rol Administrador tiene gestión de usuaris/rols; el rol General no', async () => {
    const rols = await poolTest.query<{ nom: string; moduls_permesos: string[] }>(
      `SELECT nom, moduls_permesos FROM rol WHERE nom IN ('Administrador', 'General')`,
    );
    const administrador = rols.rows.find((r) => r.nom === 'Administrador');
    const general = rols.rows.find((r) => r.nom === 'General');

    expect(administrador?.moduls_permesos).toEqual(expect.arrayContaining(['usuaris', 'rols']));
    expect(general?.moduls_permesos).not.toEqual(expect.arrayContaining(['usuaris']));
    expect(general?.moduls_permesos).not.toEqual(expect.arrayContaining(['rols']));
  });

  it('token sin email ni name: usa el fallback determinístico uid@dpages.local', async () => {
    const req = crearReqFake({ uid: 'uid-sense-dades', rol: null, email: null, nom: null });
    const reply = crearReplyFake();

    await crearMiddlewareResoldreUsuari(poolTest)(req, reply);

    expect(reply.codigo).toBeUndefined();
    expect(req.usuariResolt?.email).toBe('uid-sense-dades@dpages.local');
    expect(req.usuariResolt?.nom).toBe('uid-sense-dades@dpages.local');
  });

  it('uid ya provisionado: reutiliza la fila, no crea una segunda', async () => {
    const primeraVez = crearReqFake({
      uid: 'uid-repetit',
      rol: null,
      email: 'a@dpages.cat',
      nom: 'A',
    });
    await crearMiddlewareResoldreUsuari(poolTest)(primeraVez, crearReplyFake());
    const idPrimeraVez = primeraVez.usuariResolt!.id;

    const segonaVegada = crearReqFake({
      uid: 'uid-repetit',
      rol: null,
      email: 'a@dpages.cat',
      nom: 'A',
    });
    await crearMiddlewareResoldreUsuari(poolTest)(segonaVegada, crearReplyFake());

    expect(segonaVegada.usuariResolt!.id).toBe(idPrimeraVez);
    const total = await poolTest.query<{ count: string }>(
      `SELECT count(*) FROM usuari WHERE firebase_uid = 'uid-repetit'`,
    );
    expect(total.rows[0]?.count).toBe('1');
  });

  it('usuari existent i actiu=false: 403 SENSE_PERMIS, no adjunta usuariResolt', async () => {
    await poolTest.query(
      `INSERT INTO usuari (firebase_uid, nom, email, rol_id, actiu)
       VALUES ('uid-inactiu', 'Inactiu', 'inactiu@dpages.cat',
               (SELECT id FROM rol WHERE nom = 'Administrador'), false)`,
    );
    const req = crearReqFake({
      uid: 'uid-inactiu',
      rol: null,
      email: 'inactiu@dpages.cat',
      nom: 'Inactiu',
    });
    const reply = crearReplyFake();

    await crearMiddlewareResoldreUsuari(poolTest)(req, reply);

    expect(reply.codigo).toBe(403);
    expect(reply.cuerpo).toMatchObject({ error: { codi: 'SENSE_PERMIS' } });
    expect(req.usuariResolt).toBeUndefined();
  });
});
