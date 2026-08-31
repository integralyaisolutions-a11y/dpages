import type { RolApi } from '@dpages/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { construirServidor as construirServidorType } from '../../servidor.js';
import { MODULS_VALIDS } from './rols.js';
import {
  cuerpoJson,
  type EntornTestApi,
  netejarEntornApi,
  prepararEntornApi,
  promoureAAdministrador,
} from './test-suport.js';

/**
 * Capa 39 — agujero de seguridad: POST/PATCH/DELETE /rols no tenían NINGÚN
 * guard. Estos tests cubren los tres guards nuevos (mismo criterio que
 * POST /usuaris, ver comu.ts/crearGuardaModul), la validación de
 * modulsPermesos contra la lista real de módulos, y el DELETE nuevo con su
 * guarda de integridad (mismo patrón que DELETE /categories/:id).
 */
describe('API negoci — /rols, guardas i validació de mòduls (capa 39, Postgres real, esquema aislado)', () => {
  let entorn: EntornTestApi;
  let construirServidor: typeof construirServidorType;

  beforeAll(async () => {
    entorn = await prepararEntornApi('rols');
    construirServidor = entorn.construirServidor;
  });

  afterAll(() => netejarEntornApi(entorn));

  it('POST /rols: usuari amb rol General (per defecte) dona 403 SENSE_PERMIS', async () => {
    const fastify = construirServidor();
    await fastify.inject({ method: 'GET', url: '/api/v1/jo' }); // auto-provisiona com a General

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rols',
      payload: { nom: 'Intent no autoritzat', modulsPermesos: ['comandes'] },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { codi: 'SENSE_PERMIS' } });

    await fastify.close();
  });

  it('PATCH /rols/:id: usuari amb rol General dona 403 SENSE_PERMIS', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const rol = cuerpoJson<RolApi>(
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/rols',
        payload: { nom: 'Rol capa 39 A', modulsPermesos: ['comandes'] },
      }),
    );
    // Vuelve a General para probar el guard del PATCH.
    await entorn.poolTest.query(
      `UPDATE usuari SET rol_id = (SELECT id FROM rol WHERE nom = 'General') WHERE firebase_uid = 'dev-sense-auth'`,
    );

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/rols/${rol.id}`,
      payload: { modulsPermesos: ['comandes', 'usuaris', 'rols'] },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { codi: 'SENSE_PERMIS' } });

    await fastify.close();
  });

  it('DELETE /rols/:id: usuari amb rol General dona 403 SENSE_PERMIS', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const rol = cuerpoJson<RolApi>(
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/rols',
        payload: { nom: 'Rol capa 39 B', modulsPermesos: ['comandes'] },
      }),
    );
    await entorn.poolTest.query(
      `UPDATE usuari SET rol_id = (SELECT id FROM rol WHERE nom = 'General') WHERE firebase_uid = 'dev-sense-auth'`,
    );

    const res = await fastify.inject({ method: 'DELETE', url: `/api/v1/rols/${rol.id}` });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { codi: 'SENSE_PERMIS' } });

    await fastify.close();
  });

  it('POST /rols amb un valor de modulsPermesos no vàlid dona 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/rols',
      payload: { nom: 'Rol invàlid', modulsPermesos: ['comandes', 'no-existeix'] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    await fastify.close();
  });

  it('PATCH /rols/:id amb un valor de modulsPermesos no vàlid dona 400 VALIDACIO', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const rol = cuerpoJson<RolApi>(
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/rols',
        payload: { nom: 'Rol capa 39 C', modulsPermesos: ['comandes'] },
      }),
    );

    const res = await fastify.inject({
      method: 'PATCH',
      url: `/api/v1/rols/${rol.id}`,
      payload: { modulsPermesos: ['comandes', 'super-admin'] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { codi: 'VALIDACIO' } });

    // No quedó a medio aplicar.
    const llistat = cuerpoJson<{ dades: RolApi[] }>(
      await fastify.inject({ method: 'GET', url: '/api/v1/rols' }),
    );
    expect(llistat.dades.find((r) => r.id === rol.id)?.modulsPermesos).toEqual(['comandes']);

    await fastify.close();
  });

  it('DELETE /rols/:id amb usuaris assignats dona 409 CONFLICTE', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const rol = cuerpoJson<RolApi>(
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/rols',
        payload: { nom: 'Rol en ús', modulsPermesos: ['comandes'] },
      }),
    );
    await entorn.poolTest.query(
      `INSERT INTO usuari (firebase_uid, nom, email, rol_id, actiu)
       VALUES ('uid-rol-en-us', 'Amb rol en ús', 'rol-en-us@dpages.cat',
               (SELECT id FROM rol WHERE id_seq = $1), true)`,
      [rol.id],
    );

    const res = await fastify.inject({ method: 'DELETE', url: `/api/v1/rols/${rol.id}` });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { codi: 'CONFLICTE' } });

    await fastify.close();
  });

  it('DELETE /rols/:id sense usuaris assignats dona 204', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);
    const rol = cuerpoJson<RolApi>(
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/rols',
        payload: { nom: 'Rol sense ús', modulsPermesos: ['comandes'] },
      }),
    );

    const res = await fastify.inject({ method: 'DELETE', url: `/api/v1/rols/${rol.id}` });
    expect(res.statusCode).toBe(204);

    const llistat = cuerpoJson<{ dades: RolApi[] }>(
      await fastify.inject({ method: 'GET', url: '/api/v1/rols' }),
    );
    expect(llistat.dades.some((r) => r.id === rol.id)).toBe(false);

    await fastify.close();
  });

  it('DELETE /rols/:id inexistent dona 404 NO_TROBAT', async () => {
    const fastify = construirServidor();
    await promoureAAdministrador(entorn, fastify);

    const res = await fastify.inject({ method: 'DELETE', url: '/api/v1/rols/999999' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { codi: 'NO_TROBAT' } });

    await fastify.close();
  });

  // Capa 44 — Michel reportó MODULS_VALIDS duplicado a mano en el frontend,
  // con riesgo de desincronizarse en silencio. Compara contra la constante
  // real importada (no una lista hardcodeada acá): si mañana se agrega un
  // módulo nuevo a rols.ts, este test lo sigue viendo pasar sin tocarlo, y
  // el frontend puede dejar de mantener su propia copia.
  it('GET /rols/moduls-valids retorna la constant real, sense guard', async () => {
    const fastify = construirServidor();
    // Sense promoureAAdministrador: usuari General (per defecte) ha de poder llegir-ho igual.
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/rols/moduls-valids' });

    expect(res.statusCode).toBe(200);
    const cuerpo = cuerpoJson<{ dades: string[] }>(res);
    expect(cuerpo.dades).toEqual([...MODULS_VALIDS]);

    await fastify.close();
  });
});
