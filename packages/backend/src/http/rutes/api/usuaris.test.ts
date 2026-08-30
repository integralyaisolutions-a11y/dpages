import type { RespostaPaginada, RolApi, UsuariApi } from '@dpages/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GestioUsuarisFirebase } from '../../auth-firebase.js';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
  promoureAAdministrador,
} from './test-suport.js';
import { crearUsuariAmbLink } from './usuaris.js';

/**
 * Los tres mocks se devuelven también como variables sueltas (no sólo
 * colgando de `firebase.xxx`) para poder aserirlos con
 * `expect(crearUsuari).toHaveBeenCalledWith(...)` — acceder a un método vía
 * la propiedad de un objeto dispara `@typescript-eslint/unbound-method`
 * (mismo motivo por el que auth-firebase.test.ts asigna su `VerificadorToken`
 * simulado a una `const` suelta en vez de un objeto).
 */
function mockGestioFirebase(opcions?: { uid?: string; link?: string; fallaGenerarLink?: Error }): {
  firebase: GestioUsuarisFirebase;
  crearUsuari: ReturnType<typeof vi.fn>;
  esborrarUsuari: ReturnType<typeof vi.fn>;
  generarLinkEstabliment: ReturnType<typeof vi.fn>;
} {
  const crearUsuari = vi.fn().mockResolvedValue({ uid: opcions?.uid ?? `uid-${randomUUID()}` });
  const esborrarUsuari = vi.fn().mockResolvedValue(undefined);
  const generarLinkEstabliment = opcions?.fallaGenerarLink
    ? vi.fn().mockRejectedValue(opcions.fallaGenerarLink)
    : vi.fn().mockResolvedValue(opcions?.link ?? 'https://firebase.example/__/auth/action');

  return {
    firebase: { crearUsuari, esborrarUsuari, generarLinkEstabliment },
    crearUsuari,
    esborrarUsuari,
    generarLinkEstabliment,
  };
}

describe('API negoci — /jo, /usuaris, /rols (Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    entorn = await prepararEntornApi('usuaris');
    construirServidor = entorn.construirServidor;
  });

  afterAll(() => netejarEntornApi(entorn));

  it('GET /jo: auto-provisiona con rol General (AUTH_DISABLED=true, uid fijo de dev) — no Administrador', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/jo' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<UsuariApi>(res);
    expect(cuerpo.firebaseUid).toBe('dev-sense-auth');
    expect(cuerpo.actiu).toBe(true);
    expect(cuerpo.rol.nom).toBe('General');
    expect(cuerpo.rol.modulsPermesos).toContain('panell-produccio');
    // Nadie obtiene gestión de usuarios/roles sólo por loguearse primero.
    expect(cuerpo.rol.modulsPermesos).not.toContain('usuaris');
    expect(cuerpo.rol.modulsPermesos).not.toContain('rols');

    await fastify.close();
  });

  it('GET /usuaris: el usuario auto-provisionado por /jo aparece en el listado', async () => {
    const fastify = construirServidor();
    // Dispara el auto-provisioning si todavía no corrió en este esquema.
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/usuaris' });
    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RespostaPaginada<UsuariApi>>(res);
    const devUser = cuerpo.dades.find((u) => u.firebaseUid === 'dev-sense-auth');
    expect(devUser).toBeDefined();
    expect(devUser?.rol.nom).toBe('General');

    const nomesActius = cuerpoJson<RespostaPaginada<UsuariApi>>(
      await fastify.inject({ method: 'GET', url: '/api/v1/usuaris?actiu=true' }),
    );
    expect(nomesActius.dades.every((u) => u.actiu)).toBe(true);

    await fastify.close();
  });

  it('PATCH /usuaris/:id: edita nom/rolId/actiu, pero no toca firebaseUid ni email', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const jo = cuerpoJson<UsuariApi>(await fastify.inject({ method: 'GET', url: '/api/v1/jo' }));

    const rolNou = cuerpoJson<RolApi>(
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/rols',
        payload: { nom: 'Obrador', modulsPermesos: ['panell-obrador'] },
      }),
    );

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/usuaris/${jo.id}`,
      payload: { nom: 'Nom Editat', rolId: rolNou.id },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<UsuariApi>(res);
    expect(cuerpo.nom).toBe('Nom Editat');
    expect(cuerpo.rol.id).toBe(rolNou.id);
    expect(cuerpo.rol.nom).toBe('Obrador');
    // Inmutables — sin cambios.
    expect(cuerpo.firebaseUid).toBe('dev-sense-auth');
    expect(cuerpo.email).toBe(jo.email);

    await fastify.close();
  });

  it('PATCH /usuaris/:id amb un id inexistent da 404 NO_TROBAT', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/usuaris/999999',
      payload: { nom: 'X' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

    await fastify.close();
  });

  it('PATCH /usuaris/:id amb rolId inexistent da 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const jo = cuerpoJson<UsuariApi>(await fastify.inject({ method: 'GET', url: '/api/v1/jo' }));

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/usuaris/${jo.id}`,
      payload: { rolId: 999999 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('crearUsuariAmbLink: alta exitosa — crea en Firebase, registro local y genera el link', async () => {
    const rolAdmin = await entorn.poolTest.query<{ id_seq: string }>(
      `SELECT id_seq FROM rol WHERE nom = 'Administrador'`,
    );
    const rolId = Number(rolAdmin.rows[0]!.id_seq);
    const email = `nova-${randomUUID()}@example.com`;
    const { firebase, crearUsuari, esborrarUsuari, generarLinkEstabliment } = mockGestioFirebase();

    const resultat = await crearUsuariAmbLink(entorn.poolTest, firebase, {
      nom: 'Nova Persona',
      email,
      rolId,
    });

    expect(resultat.tipus).toBe('ok');
    if (resultat.tipus !== 'ok') throw new Error('esperava tipus ok');
    expect(crearUsuari).toHaveBeenCalledWith(email);
    expect(generarLinkEstabliment).toHaveBeenCalledWith(email);
    expect(esborrarUsuari).not.toHaveBeenCalled();
    expect(resultat.usuari.nom).toBe('Nova Persona');
    expect(resultat.usuari.email).toBe(email);
    expect(resultat.linkEstabliment).toBe('https://firebase.example/__/auth/action');

    const fila = await entorn.poolTest.query('SELECT id FROM usuari WHERE email = $1', [email]);
    expect(fila.rows).toHaveLength(1);
  });

  it('crearUsuariAmbLink: email ja existent dona CONFLICTE sense trucar a Firebase', async () => {
    const rolAdmin = await entorn.poolTest.query<{ id_seq: string }>(
      `SELECT id_seq FROM rol WHERE nom = 'Administrador'`,
    );
    const rolId = Number(rolAdmin.rows[0]!.id_seq);
    const email = `duplicat-${randomUUID()}@example.com`;

    const primer = await crearUsuariAmbLink(entorn.poolTest, mockGestioFirebase().firebase, {
      nom: 'Primer',
      email,
      rolId,
    });
    expect(primer.tipus).toBe('ok');

    const { firebase: firebaseSegonIntent, crearUsuari: crearUsuariSegonIntent } =
      mockGestioFirebase();
    const segon = await crearUsuariAmbLink(entorn.poolTest, firebaseSegonIntent, {
      nom: 'Segon',
      email,
      rolId,
    });

    expect(segon.tipus).toBe('conflicte');
    expect(crearUsuariSegonIntent).not.toHaveBeenCalled();
  });

  it('crearUsuariAmbLink: rolId inexistent dona VALIDACIO sense trucar a Firebase', async () => {
    const { firebase, crearUsuari } = mockGestioFirebase();

    const resultat = await crearUsuariAmbLink(entorn.poolTest, firebase, {
      nom: 'X',
      email: `sense-rol-${randomUUID()}@example.com`,
      rolId: 999999,
    });

    expect(resultat.tipus).toBe('validacio');
    expect(crearUsuari).not.toHaveBeenCalled();
  });

  it('crearUsuariAmbLink: si falla després de crear a Firebase, reverteix (esborrarUsuari) i no deixa fila local', async () => {
    const rolAdmin = await entorn.poolTest.query<{ id_seq: string }>(
      `SELECT id_seq FROM rol WHERE nom = 'Administrador'`,
    );
    const rolId = Number(rolAdmin.rows[0]!.id_seq);
    const email = `revert-${randomUUID()}@example.com`;
    const { firebase, esborrarUsuari } = mockGestioFirebase({
      uid: 'uid-a-revertir',
      fallaGenerarLink: new Error('fallo simulat'),
    });

    await expect(
      crearUsuariAmbLink(entorn.poolTest, firebase, { nom: 'Revert', email, rolId }),
    ).rejects.toThrow('fallo simulat');

    expect(esborrarUsuari).toHaveBeenCalledWith('uid-a-revertir');

    const fila = await entorn.poolTest.query('SELECT id FROM usuari WHERE email = $1', [email]);
    expect(fila.rows).toHaveLength(0);
  });

  it('POST /usuaris: sense el mòdul "usuaris" (rol General, per defecte en dev) dona 403 SENSE_PERMIS', async () => {
    const fastify = construirServidor();
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });
    // Defensivo: no depende del orden respecto a otros tests de este mismo
    // archivo (comparten esquema) que promueven al usuario de prueba a
    // Administrador — se asegura de arrancar sin el módulo 'usuaris'.
    await entorn.poolTest.query(
      `UPDATE usuari SET rol_id = (SELECT id FROM rol WHERE nom = 'General') WHERE firebase_uid = 'dev-sense-auth'`,
    );

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/usuaris',
      payload: { nom: 'X', email: `guard-${randomUUID()}@example.com`, rolId: 1 },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { codi: 'SENSE_PERMIS' } });

    await fastify.close();
  });

  it('GET /rols: Administrador y General, sembrados por la migración 0014, con módulos distintos', async () => {
    const fastify = construirServidor();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/rols' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<{ dades: RolApi[] }>(res);
    const admin = cuerpo.dades.find((r) => r.nom === 'Administrador');
    expect(admin).toBeDefined();
    expect(admin?.modulsPermesos).toEqual(
      expect.arrayContaining(['categories', 'comandes', 'usuaris', 'rols', 'panell-produccio']),
    );

    const general = cuerpo.dades.find((r) => r.nom === 'General');
    expect(general).toBeDefined();
    expect(general?.modulsPermesos).not.toEqual(expect.arrayContaining(['usuaris']));
    expect(general?.modulsPermesos).not.toEqual(expect.arrayContaining(['rols']));

    await fastify.close();
  });

  it('POST /rols crea un rol nuevo', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rols',
      payload: { nom: 'Empaquetat', modulsPermesos: ['panell-empaquetat'] },
    });

    expect(res.statusCode).toBe(201);
    const cuerpo = cuerpoJson<RolApi>(res);
    expect(cuerpo).toMatchObject({ nom: 'Empaquetat', modulsPermesos: ['panell-empaquetat'] });

    await fastify.close();
  });

  it('POST /rols sense nom da 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rols',
      payload: { modulsPermesos: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('PATCH /rols/:id edita modulsPermesos parcialmente', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const creat = cuerpoJson<RolApi>(
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/rols',
        payload: { nom: 'Oficina', modulsPermesos: ['comandes'] },
      }),
    );

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/rols/${creat.id}`,
      payload: { modulsPermesos: ['comandes', 'tarifes-clients', 'tarifes'] },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RolApi>(res);
    expect(cuerpo.nom).toBe('Oficina'); // no enviado, no cambia
    expect(cuerpo.modulsPermesos).toEqual(['comandes', 'tarifes-clients', 'tarifes']);

    await fastify.close();
  });

  it('PATCH /usuaris/:id: usuari amb rol General (sense el mòdul "usuaris") intentant auto-promocionar-se a Administrador dona 403 SENSE_PERMIS', async () => {
    const fastify = construirServidor();
    const jo = cuerpoJson<UsuariApi>(await fastify.inject({ method: 'GET', url: '/api/v1/jo' }));
    // Defensivo: no depende del orden de los tests anteriores — se
    // asegura de que el usuario de prueba arranca sin el módulo 'usuaris',
    // tal como lo deja el auto-provisioning real (rol General).
    await entorn.poolTest.query(
      `UPDATE usuari SET rol_id = (SELECT id FROM rol WHERE nom = 'General') WHERE firebase_uid = 'dev-sense-auth'`,
    );
    const rolAdmin = await entorn.poolTest.query<{ id_seq: string }>(
      `SELECT id_seq FROM rol WHERE nom = 'Administrador'`,
    );

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/usuaris/${jo.id}`,
      payload: { rolId: Number(rolAdmin.rows[0]!.id_seq) },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { codi: 'SENSE_PERMIS' } });

    // Y no quedó a medio aplicar: sigue siendo General.
    const despues = cuerpoJson<UsuariApi>(
      await fastify.inject({ method: 'GET', url: '/api/v1/jo' }),
    );
    expect(despues.rol.nom).toBe('General');

    await fastify.close();
  });
});
