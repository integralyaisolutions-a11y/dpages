import type { RespostaPaginada, RolApi, UsuariApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
} from './test-suport.js';

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
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });
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
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' });
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
      payload: { modulsPermesos: ['comandes', 'clients', 'tarifes'] },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<RolApi>(res);
    expect(cuerpo.nom).toBe('Oficina'); // no enviado, no cambia
    expect(cuerpo.modulsPermesos).toEqual(['comandes', 'clients', 'tarifes']);

    await fastify.close();
  });
});
