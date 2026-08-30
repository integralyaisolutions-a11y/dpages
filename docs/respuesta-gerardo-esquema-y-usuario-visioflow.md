# Respuesta a Gerardo — esquema de base de datos y origen de visioflow.tech@gmail.com

Fecha: 2026-08-30
Autor: sesión de Claude Code de Michelle (frontend), a pedido de Gerardo tras revisar el repo.

## Pregunta 1 — ¿Hay cambios de esquema fuera de las 16 migraciones conocidas?

### 1. Estado de `npm run migrate:status`

```
0001_infraestructura_sincronizacion.up.sql                 aplicada    2026-08-17 21:50:49 UTC
0002_cataleg.up.sql                                        aplicada    2026-08-17 21:50:49 UTC
0003_model_transaccional.up.sql                            aplicada    2026-08-17 21:50:49 UTC
0004_seguiment_sincronitzacio.up.sql                        aplicada    2026-08-17 21:50:49 UTC
0005_transformacio_comandes.up.sql                          aplicada    2026-08-17 21:50:49 UTC
0006_categories_i_confirmacio.up.sql                        aplicada    2026-08-17 21:50:49 UTC
0007_incidencia_cataleg_i_neteja_producte_fantasma.up.sql   aplicada    2026-08-17 21:50:49 UTC
0008_api_negoci.up.sql                                      aplicada    2026-08-17 21:50:49 UTC
0009_resolucio_client.up.sql                                aplicada    2026-08-17 21:50:49 UTC
0010_camps_prototip_agost.up.sql                            aplicada    2026-08-17 21:50:49 UTC
0011_cataleg_extens.up.sql                                  aplicada    2026-08-25 03:58:28 UTC
0012_rendiments_i_mantenim.up.sql                           aplicada    2026-08-25 03:58:28 UTC
0013_correccions_capa15.up.sql                              aplicada    2026-08-25 03:58:28 UTC
0014_usuaris_i_rols.up.sql                                  aplicada    2026-08-25 03:58:28 UTC
0015_client_codi_unic.up.sql                                aplicada    2026-08-25 03:58:28 UTC
0016_unitats_decimal.up.sql                                 aplicada    2026-08-29 13:34:38 UTC
```

**16 de 16 aplicadas, ninguna pendiente, ninguna de más.**

### 2. Esquema real de `rol` / `usuari` vs. migración 0014

Volcado real con `\d rol` / `\d usuari` contra la base local:

```
Table "public.rol"
     Column      |           Type           | Nullable |           Default
-----------------+--------------------------+----------+------------------------------
 id              | uuid                     | not null | gen_random_uuid()
 id_seq          | bigint                   | not null | generated always as identity
 nom             | text                     | not null |
 moduls_permesos | text[]                   | not null | '{}'::text[]
 creat_en        | timestamp with time zone | not null | now()

Table "public.usuari"
    Column    |           Type           | Nullable |           Default
--------------+--------------------------+----------+------------------------------
 id           | uuid                     | not null | gen_random_uuid()
 id_seq       | bigint                   | not null | generated always as identity
 firebase_uid | text                     | not null |
 nom          | text                     | not null |
 email        | text                     | not null |
 rol_id       | uuid                     | not null |
 actiu        | boolean                  | not null | true
 creat_en     | timestamp with time zone | not null | now()
```

Comparado columna por columna contra el `CREATE TABLE` real de `migrations/0014_usuaris_i_rols.up.sql`: **coincide exacto** — mismos nombres, mismos tipos, mismas nulabilidad, mismos defaults, mismas unique constraints (`rol_nom_key`, `usuari_firebase_uid_key`), mismo índice (`idx_usuari_firebase_uid`), misma FK (`usuari.rol_id → rol.id`). Ninguna columna extra, ninguna faltante.

Además confirmé con `grep` sobre las 16 migraciones que **ninguna migración posterior a la 0014 vuelve a tocar `rol` ni `usuari`** (ningún `ALTER TABLE rol`, `ALTER TABLE usuari` en ningún archivo `.up.sql`) — 0014 es la única que las crea y la única que las toca.

### 3. Los 4 roles nuevos (Oficina/Obrador/Empaquetat/Producció) — vía API, no SQL ni migración

Se crearon con `POST /rols` real (llamadas HTTP contra el backend corriendo, no `INSERT` manual ni DDL). Evidencia de que esto es consistente con el esquema sin cambios: `moduls_permesos` sigue siendo `TEXT[]` sin ningún `CHECK` (confirmado en el `\d rol` de arriba) — por eso un rol nuevo con un array de un solo módulo (ej. `{panell-oficina}`) entra sin fricción, sin necesitar ninguna columna ni tipo nuevo. La ruta `POST /rols` (`rols.ts`) hace un `INSERT INTO rol (nom, moduls_permesos) VALUES (...)` liso sobre las columnas ya existentes — no ejecuta ni puede ejecutar DDL.

### 4. ¿Se ejecutó algún DDL manual (ALTER/CREATE/DROP) fuera del runner de migraciones?

Repasé **todo el historial de comandos SQL de esta sesión** (todas las consultas via `docker exec dpages-postgres psql`): sin excepción son `SELECT` (inventario/verificación) o, en una limpieza puntual de usuarios de prueba en una sesión anterior, `DELETE` sobre filas concretas (`DELETE FROM usuari WHERE id_seq = ...`). **Ningún `ALTER TABLE`, `CREATE TABLE` ni `DROP` fuera de lo que corre `npm run migrate`** en ningún momento documentado de esta conversación. Aclaración de alcance: esto cubre todo lo visible en esta sesión (incluida la parte resumida de sesiones previas dentro de la misma conversación); no puedo dar fe de nada fuera de ese historial.

### Conclusión — Pregunta 1

**El esquema de la base local es 100% idéntico al que producen las 16 migraciones oficiales.** No hay ninguna diferencia de esquema. Todo lo que se agregó "a mano" esta sesión (los 4 roles nuevos, los 5 usuarios de prueba) es **dato**, no **esquema** — filas nuevas sobre columnas que ya existían desde la 0014, insertadas vía los endpoints reales (`POST /rols`, `POST /usuaris`), nunca vía SQL directo ni DDL.

---

## Pregunta 2 — Origen de `visioflow.tech@gmail.com`

### 1. `creat_en` en `usuari`

```sql
SELECT id_seq, email, nom, creat_en, firebase_uid FROM usuari WHERE email = 'visioflow.tech@gmail.com';
```

```
 id_seq |          email           |           nom            |          creat_en           |         firebase_uid
--------+--------------------------+--------------------------+------------------------------+------------------------------
     11 | visioflow.tech@gmail.com | visioflow.tech@gmail.com | 2026-08-29 21:32:05.3878+00 | 8NOEtlvrz8Nklf3BkHLSc5gatsw1
```

Fila creada el **2026-08-29 a las 21:32:05 UTC**. Dato relevante: `nom` es idéntico al email — eso pasa únicamente cuando el auto-provisioning (`resoldre-usuari.ts`) no encuentra un claim `name` en el token de Firebase, y cae al email como último recurso.

### 2. Metadatos reales en Firebase (Admin SDK, `getUserByEmail`)

```json
{
  "uid": "8NOEtlvrz8Nklf3BkHLSc5gatsw1",
  "email": "visioflow.tech@gmail.com",
  "emailVerified": false,
  "disabled": false,
  "metadata": {
    "creationTime": "Mon, 17 Aug 2026 13:45:45 GMT",
    "lastSignInTime": "Sat, 29 Aug 2026 21:48:44 GMT",
    "lastRefreshTime": "Sun, 30 Aug 2026 02:45:59 GMT"
  },
  "providerData": [
    { "providerId": "password", "email": "visioflow.tech@gmail.com" }
  ],
  "customClaims": null
}
```

Dos datos concretos que contradicen una lectura apresurada del email:
- **La cuenta de Firebase existe desde el 17 de agosto** (12 días antes de que apareciera la fila local) — es una cuenta real y previa, no algo creado sobre la marcha.
- **El único proveedor es `password`** (email + contraseña) — **no hay `google.com` en `providerData`**. Pese al dominio gmail.com del email, esta cuenta nunca inició sesión con "Iniciar sesión con Google".

### 3. Cruce con el log real del backend — evidencia directa, no inferida

Buscando en el log del proceso backend que corrió esta sesión (`pid 35032`) encontré la secuencia exacta:

| Hora (UTC) | Evento |
|---|---|
| 21:32:05.387 | `usuari.creat_en` — fila auto-provisionada (primer `GET /jo` de este uid contra el backend, rol `General` por defecto) |
| **21:32:58** | `PATCH /api/v1/usuaris/11` — capturado tal cual en el log del backend, **53 segundos después** |

La request de las 21:32:58 llegó con el patrón típico de un navegador real (`OPTIONS` de preflight CORS inmediatamente antes del `PATCH`, mismo `remotePort`) — no un script/curl. Yo no ejecuté esta llamada: en toda esta sesión sólo trabajé con el usuario `id_seq 1` (`dev-sense-auth`) y los usuarios de prueba `id_seq 5–10`; `id_seq 11` no aparece en ninguna otra acción mía.

Esto pasó **durante esta misma sesión**, en la ventana en la que `AUTH_DISABLED` ya estaba en `false` y `GOOGLE_APPLICATION_CREDENTIALS` recién configurado — es decir, la primera vez que alguien pudo loguearse de verdad contra el backend con un usuario real. El rol actual de la fila (`Administrador`) es consistente con ese único `PATCH` a los 53 segundos de la auto-provisión.

### 4. Conclusión — Pregunta 2

Con la evidencia de arriba (no por el nombre del email):

- Es una **cuenta de Firebase real y preexistente** (creada el 17/08, con contraseña, nunca vía Google).
- Su fila en `usuari` se auto-provisionó **recién el 29/08 a las 21:32:05**, en el momento exacto en que el login real quedó habilitado por primera vez en el entorno local (`AUTH_DISABLED=false`).
- Se promovió a Administrador **53 segundos después**, con un `PATCH /usuaris/11` que el log del backend registra como originado en un navegador — acción humana real, en tiempo real, no un artefacto de prueba ni algo que yo haya ejecutado.

Todo apunta a que alguien (muy probablemente Michelle, que es quien tiene acceso al entorno y al navegador donde corría el frontend en ese momento) inició sesión por primera vez con su propia cuenta real apenas se habilitó el login real, y se auto-promovió a Administrador desde la pantalla de Usuaris — **no es un usuario de prueba de esta sesión ni un dato que haya que limpiar sin preguntar antes**.
