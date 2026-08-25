# Auditoría de arranque del entorno local — dPagès

Documento de inventario/diagnóstico. **No se modificó ni se levantó ningún
componente** durante esta auditoría — sólo lectura de código y
configuración. Complementa a `AUDITORIA_FRONTEND.md` y
`AUDITORIA_BACKEND.md`; mismo criterio: hallazgo + evidencia concreta, no
asunciones.

---

## 1. Docker y base de datos

### `docker-compose.yml` (raíz del repo, único en el monorepo)

```yaml
services:
  postgres:
    image: postgres:16
    container_name: dpages-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: dpages
      POSTGRES_PASSWORD: dpages
      POSTGRES_DB: dpages
    ports:
      - '5433:5432'
    volumes:
      - dpages_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dpages -d dpages']
      interval: 5s
      timeout: 5s
      retries: 10

  postgres-test:
    image: postgres:16
    container_name: dpages-postgres-test
    environment:
      POSTGRES_USER: dpages
      POSTGRES_PASSWORD: dpages
      POSTGRES_DB: dpages_test
    ports:
      - '5434:5432'
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dpages -d dpages_test']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  dpages_postgres_data:
    name: dpages_postgres_data
```

No hay ningún otro `docker-compose*.yml` en el repo (búsqueda `**/docker-compose*.yml`
sólo devuelve este archivo).

### Discrepancia Postgres 15 vs 16 — **resuelta y documentada, no abierta**

El hallazgo tal como se planteó en el pedido ("la documentación dice 15, GCP
dice 16") ya fue detectado y cerrado por el propio equipo, en
[`docs/infraestructura-gcp-estado-16ago.md`](./docs/infraestructura-gcp-estado-16ago.md#5-un-ajuste-sobre-versión-de-postgres-contra-la-propuesta-económica),
sección 5, texto literal:

> La propuesta económica original especificaba `db-f1-micro` con Postgres
> **15**. El proyecto se construyó desde el día uno sobre Postgres **16**
> (`docker-compose.yml`, CI, `Dockerfile`) — un desalineamiento de
> documentación, no una decisión técnica tomada a propósito. Se revisaron
> las 10 migraciones y ninguna usa sintaxis exclusiva de 16, pero se decidió
> mantener 16 en Cloud SQL (mismo costo exacto, cero riesgo de divergencia
> entre entornos) en vez de forzar 15. Ya se le avisó a Eloy por escrito.

Evidencia cruzada, todas apuntan a 16:
- `docker-compose.yml` (arriba): `postgres:16` en ambos servicios.
- `.github/workflows/ci.yml:31`: `image: postgres:16`.
- `docs/infraestructura-gcp-setup.md:139`: `--database-version=POSTGRES_16`.
- `docs/infraestructura-gcp-estado-16ago.md:24`: Cloud SQL `dpages-db` corre
  "Postgres 16, `db-f1-micro`, zonal, `RUNNABLE`".

**Conclusión**: la versión real, en todos los entornos (local, CI, Cloud SQL),
es **Postgres 16**. La mención a "15" sólo existe en la propuesta económica
original, ya marcada como desalineada por el propio equipo. No hace falta
ninguna decisión nueva — sólo tenerlo presente si alguien vuelve a
preguntar (el documento del 16 de agosto ya anticipa esa pregunta de
Integraly).

### Migraciones — directorio único, comando de aplicación desde cero

15 archivos `.up.sql` (+ 15 `.down.sql`) en `packages/backend/migrations/`,
numerados `0001` a `0015`, un solo directorio versionado:

```
0001_infraestructura_sincronizacion   0009_resolucio_client
0002_cataleg                          0010_camps_prototip_agost
0003_model_transaccional              0011_cataleg_extens
0004_seguiment_sincronitzacio         0012_rendiments_i_mantenim
0005_transformacio_comandes           0013_correccions_capa15
0006_categories_i_confirmacio         0014_usuaris_i_rols
0007_incidencia_cataleg_i_neteja_...  0015_client_codi_unic
0008_api_negoci
```

(Nota: la auditoría de backend previa decía "15 migraciones aplicadas" — se
confirma que son exactamente 15, no 10 como decía un hallazgo más viejo de
la auditoría de arranque original de esta sesión; el número correcto y
actual es 15.)

El runner (`packages/backend/src/db/migrate.ts`) es idempotente y aplica
contra **cualquier** Postgres al que apunte `DATABASE_URL` — no distingue
"local nueva" de "Cloud SQL": simplemente aplica lo que falte, cada
migración en su propia transacción, con verificación de checksum contra lo
ya aplicado (`verificarIntegridad`). Contra una base completamente vacía,
aplica las 15 en orden.

Comando exacto, contra la base local (`postgres`, puerto 5433, la que arma
`DATABASE_URL` del `.env.example` por defecto):

```
npm run migrate
```

(equivalente a `npm run migrate -w @dpages/backend`, que a su vez corre
`tsx --env-file-if-exists=../../.env src/db/migrate.ts up`)

Para ver el estado sin aplicar nada: `npm run migrate:status`.

### Seed de datos de arranque — sí existe

`packages/backend/src/scripts/seed-arranque.ts`. Carga dos tablas mínimas
para no arrancar completamente vacío:
- `categoria_producte`: 8 categorías fijas (ELABORAT CUIT/CURAT/FRESC/FUMAT,
  PECES MAGRES/NOBLES KG/NOBLES PAQ, VÍSCERES), con su
  `agrupacio_rendiment` correspondiente.
- `origen_comanda`: `woocommerce` y `manual`.

Es un UPSERT (`ON CONFLICT ... DO UPDATE`), por lo que correrlo más de una
vez no duplica nada. El propio comentario del archivo aclara su origen y
autorización:

> Seed de datos de arranque — autorizado por el cliente (Francesc),
> confirmado el 18/08/2026. [...] Vienen del prototipo de Lovable. [...]
> son reemplazables sin drama, NO son la fuente de verdad final.

A diferencia del runner de migraciones, no tiene un script `npm run` propio
declarado en `package.json` — se corre directo con:

```
npx tsx --env-file-if-exists=../../.env packages/backend/src/scripts/seed-arranque.ts
```

**No hay ningún otro seed** para catálogo real, clientes, tarifas, ni
usuarios — el catálogo de ~111 artículos reales sigue sin datos de carga en
este repo (consistente con lo ya documentado: los datos reales del cliente
llegan en el cut-over).

Nota aparte: `packages/backend/migrations/0014_usuaris_i_rols.up.sql` sí
siembra los roles `Administrador`/`General` como parte de la migración
misma (no del seed) — eso confirma lo ya reportado en `AUDITORIA_BACKEND.md`.

---

## 2. Backend

### Variables de entorno (`packages/backend/src/config/env.ts`)

| Variable | Obligatoria / default | Notas |
|---|---|---|
| `NODE_ENV` | default `development` | `development \| test \| production` |
| `PORT` | default `8080` | Cloud Run la inyecta; en local se usa este valor |
| `LOG_LEVEL` | default `info` | Pino |
| `DATABASE_URL` | **obligatoria** | debe empezar con `postgres://` o `postgresql://` |
| `DB_POOL_MAX` | default `5` | máx. 20 |
| `WC_BASE_URL` | **obligatoria** | fuera de producción, sólo host de prueba (`localhost`, `*.invalid`, `*.test`) — el proceso **no arranca** si apunta a `dpages.cat` real sin `NODE_ENV=production` |
| `WC_CONSUMER_KEY` | **obligatoria** | — |
| `WC_CONSUMER_SECRET` | **obligatoria** | — |
| `WEBHOOK_SECRET` | **obligatoria** | firma HMAC-SHA256 del webhook |
| `TASQUES_SECRET` | **obligatoria** | bearer token para `/tasques/*` en local |
| `TASQUES_OIDC_AUDIENCE` | opcional | sólo se usa en producción |
| `INGESTA_DIES_ENRERE_DEFECTE` | default `30` | sólo afecta la primera ingesta de un recurso |
| `INGESTA_HISTORIC_COMPLET` | opcional, default `false` | sólo `"true"` literal la activa |
| `AUTH_DISABLED` | opcional, default `false` | ver abajo |
| `CORS_ORIGIN` | opcional | sólo aplica en producción; fuera de producción el origen es fijo (ver más abajo) |
| `FIREBASE_ADMIN_SDK_KEY_JSON` | opcional, validación perezosa | sólo hace falta para `POST /usuaris` |

Es decir: para arrancar el backend en local hacen falta como mínimo 6
variables sin default (`DATABASE_URL`, `WC_BASE_URL`, `WC_CONSUMER_KEY`,
`WC_CONSUMER_SECRET`, `WEBHOOK_SECRET`, `TASQUES_SECRET`) — todas resueltas
con valores de placeholder/prueba en `.env.example` (sección siguiente),
salvo que se quiera probar contra el WooCommerce real de prueba.

### `AUTH_DISABLED=true` — soportado y documentado, efecto exacto

Está soportado explícitamente como flag de desarrollo (ADR-021, comentario
en `env.ts:87-95`). Con `NODE_ENV=production` el proceso **rechaza
arrancar** si `AUTH_DISABLED=true` (guarda en `superRefine`, sin excepción
posible). Fuera de producción, sólo el string literal `"true"` activa el
bypass — cualquier otro valor (incluida la variable ausente) exige token de
Firebase real siempre, incluso en desarrollo.

Efecto exacto (según el propio comentario del `.env.example`): salta la
verificación de token de Firebase en las rutas de negocio (todas menos
`/salut`, el webhook de WooCommerce y `/tasques/*`, que tienen su propio
mecanismo). Con el bypass activo, no hace falta ninguna variable adicional
de Firebase para arrancar — ni `GOOGLE_APPLICATION_CREDENTIALS` ni
`FIREBASE_ADMIN_SDK_KEY_JSON`.

### `.env.example` (raíz del repo — no hay uno separado dentro de
`packages/backend/`)

Confirmado por glob (`**/.env.example`): un único archivo, en la raíz. Los
scripts de `packages/backend/package.json` lo leen igual
(`--env-file-if-exists=../../.env`, relativo al paquete → apunta al `.env`
de la raíz). Contenido completo:

```
# Variables de entorno del backend (@dpages/backend).
# Copiá este archivo a .env en la raíz del monorepo y completá los valores.
# Nunca commitear el .env real (ya está en .gitignore).

NODE_ENV=development
PORT=8080
LOG_LEVEL=info

# Local (docker compose up — servicio "postgres", puerto 5433 del host):
DATABASE_URL=postgres://dpages:dpages@localhost:5433/dpages
# Local, contra la base de tests (servicio "postgres-test", puerto 5434):
# DATABASE_URL=postgres://dpages:dpages@localhost:5434/dpages_test
# Cloud SQL (vía Cloud SQL Auth Proxy / conector nativo de Cloud Run, socket unix):
# DATABASE_URL=postgresql://usuario:password@/dpages?host=/cloudsql/PROYECTO:REGION:INSTANCIA

DB_POOL_MAX=5

WC_BASE_URL=https://woocommerce-test.invalid
WC_CONSUMER_KEY=ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

TASQUES_SECRET=tasca_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TASQUES_OIDC_AUDIENCE=https://dpages-backend-xxxxxxxxxx.a.run.app

INGESTA_DIES_ENRERE_DEFECTE=30
# INGESTA_HISTORIC_COMPLET=true

AUTH_DISABLED=true

# FIREBASE_ADMIN_SDK_KEY_JSON={"type":"service_account","project_id":"dpages-be46b",...}
```

Todos los valores de WooCommerce (`WC_BASE_URL`, `WC_CONSUMER_KEY`,
`WC_CONSUMER_SECRET`), `WEBHOOK_SECRET` y `TASQUES_SECRET` son placeholders
sintácticamente válidos (pasan la validación de Zod) pero no funcionales
contra un WooCommerce real — alcanzan para arrancar el servidor y correr
los endpoints de negocio con `AUTH_DISABLED=true`, pero **no** para probar
ingesta/sincronización real de WooCommerce sin credenciales reales de un
host de prueba.

### Comando de instalación y arranque

Desde la raíz del monorepo:

```
npm install     # también compila @dpages/shared automáticamente (postinstall)
npm run dev     # build:shared + tsx watch del backend, puerto 8080
```

(`npm run dev` en la raíz ya encadena `build:shared` — no hace falta
correrlo aparte salvo que se edite `packages/shared` después de que el
backend ya esté corriendo, sin watch automático sobre ese paquete.)

### ¿El backend aplica migraciones solo al arrancar?

**No — se confirma que ADR-012 sigue vigente.** `migrarArriba` (la función
que aplica migraciones) sólo se invoca desde dos lugares en todo
`packages/backend/src`:
1. `src/db/migrate.ts` (el propio runner, vía `npm run migrate`).
2. Los archivos `*.test.ts` (17 ubicaciones), donde cada test crea su
   propio esquema descartable y migra sólo ese esquema — no la base de
   desarrollo.

Ninguna ruta de `src/http/servidor.ts` ni del entrypoint (`src/index.ts`)
invoca `migrarArriba`. Si se arranca `npm run dev` contra una base sin
migrar, el servidor levanta igual (no falla al arrancar) pero las consultas
contra tablas inexistentes fallarán en cuanto se llame a un endpoint que
las use — por eso el orden correcto es migrar **antes** de `npm run dev`,
nunca al revés ni en paralelo.

---

## 3. Frontend

### Variables de entorno — sí existen, y ya hay un archivo real con valores

A diferencia de lo que anticipaba el pedido ("puede que ni siquiera haya
una variable de baseURL definida todavía"), **sí existe** un archivo
`packages/frontend/.env.local` con valores ya cargados:

```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyA9QrDNMnczCj5ImRChN4C_fU5UWlgYr4I
NEXT_PUBLIC_FIREBASE_PROJECT_ID=dpages-be46b
```

No hay `packages/frontend/.env.example` (no está versionado ese contrato —
sólo existe el `.env.local` real, que además **no está cubierto por
`.gitignore`** — ver hallazgo de riesgo en la sección 5).

Aun así, esas variables **hoy no se usan en ningún lado del código**:
búsqueda de `NEXT_PUBLIC` y de `firebase`/`react-query` en
`packages/frontend/src` no encuentra ninguna coincidencia. Esto es
consistente con lo ya reportado en `AUDITORIA_FRONTEND.md`:
`packages/frontend/src/lib/api.ts` sigue teniendo, literal, en el
encabezado del archivo:

```ts
// TODO: definir baseUrl (env var), manejo de auth (token Firebase),
// manejo de errores y los tipos *Api reales cuando cierre el contrato
// con el backend.
```

Es decir: la variable de entorno para apuntar al backend ya está
preparada (`NEXT_PUBLIC_API_URL=http://localhost:8080`, coincide con el
puerto real del backend), pero la capa HTTP que la leería todavía no
existe — el frontend sigue operando 100% contra mocks en memoria, sin
ningún `fetch()` real (confirmado también en la auditoría de frontend
previa).

### Dependencias de Firebase / react-query — instaladas en la raíz, no en el frontend

`package.json` de la **raíz** del monorepo declara:
```json
"dependencies": {
  "@tanstack/react-query": "^5.101.4",
  "firebase": "^12.17.1"
}
```
Pero `packages/frontend/package.json` **no** las lista como dependencia
propia, y ningún archivo bajo `packages/frontend/src` las importa. Con
npm workspaces esto significa que ambos paquetes quedan disponibles en el
`node_modules` raíz (hoisted) y **técnicamente resolubles** desde el
frontend vía `npm install`, pero no están declaradas como dependencia
directa del paquete que las necesitaría — es una precarga a medio hacer,
no una integración funcional. Confirma y matiza lo que decía
`AUDITORIA_FRONTEND.md` ("no hay ninguna dependencia de Firebase
todavía"): la dependencia sí está descargada, pero vive en el lugar
equivocado del monorepo y no se usa en ningún import real todavía.

### Comando de instalación y arranque

```
npm install       # desde la raíz — o dentro de packages/frontend
npm run dev -w frontend
```
(o, parado dentro de `packages/frontend/`: `npm run dev`, que corre
`next dev`, puerto 3000 por defecto de Next — no hay override de puerto en
`next.config.ts` ni en ningún script).

---

## 4. Orden de arranque — checkout limpio, máquina nueva

1. **Prerrequisitos de máquina** (no automatizables): Node `>=24 <25`
   (`engines` en `package.json` raíz y de ambos paquetes) y Docker
   corriendo.

2. **Instalar dependencias** (una sola vez, desde la raíz):
   ```
   npm install
   ```
   Compila `@dpages/shared` solo (script `postinstall`).

3. **Levantar Postgres**:
   ```
   docker compose up -d postgres
   ```
   (el servicio `postgres-test` no hace falta para desarrollo manual, sólo
   lo usa CI/los tests con Vitest).

4. **Crear el `.env` de la raíz**:
   ```
   cp .env.example .env
   ```
   Los valores por defecto de `.env.example` ya alcanzan para arrancar en
   local con `AUTH_DISABLED=true` y sin WooCommerce real. **No hace falta
   ningún valor no documentado** para este paso — a diferencia de lo que
   el pedido anticipaba, no encontré ninguna variable obligatoria sin
   default conocido: las 6 obligatorias tienen placeholder funcional en
   `.env.example`.

5. **Aplicar migraciones**:
   ```
   npm run migrate
   ```
   (15 migraciones, contra la base vacía del paso 3).

6. **(Opcional pero recomendado) Cargar el seed de arranque**, para no
   trabajar con categorías/orígenes de pedido vacíos:
   ```
   npx tsx --env-file-if-exists=.env packages/backend/src/scripts/seed-arranque.ts
   ```
   (nota: el `.env` está en la raíz, no en `packages/backend/`; ajustar la
   ruta relativa según desde dónde se corra el comando — con
   `npm run` en la raíz esto no hace falta si se agrega un script, que hoy
   no existe).

7. **Levantar el backend**:
   ```
   npm run dev
   ```
   Verificar con `GET http://localhost:8080/salut` (en PowerShell, usar
   `Invoke-RestMethod`, no `curl`/`Invoke-WebRequest` — ver nota de la
   auditoría de arranque anterior sobre el prompt de seguridad de IE).

8. **Levantar el frontend** (en otra terminal):
   ```
   npm run dev -w frontend
   ```
   `packages/frontend/.env.local` ya existe con `NEXT_PUBLIC_API_URL`
   apuntando al puerto correcto del backend (8080) — pero como se detalla
   en la sección 3, **el frontend no llama a esa URL todavía**: seguirá
   mostrando datos de mock aunque el backend esté arriba. Levantar el
   backend en este punto no cambia nada visible en el frontend hoy.

No encontré ningún paso de este flujo con un prerequisito sin valor
conocido — a diferencia de lo que el pedido consideraba posible, todas las
variables obligatorias del backend tienen placeholder funcional, y el
`.env.local` del frontend ya existe con valores reales, no placeholders.

---

## 5. Riesgos conocidos — confirmados o descartados

| Riesgo planteado | Estado | Evidencia |
|---|---|---|
| `docker-compose` no coincide con la versión de Postgres que el backend necesita | **Descartado** | Ambos usan `postgres:16`; ADR/documento del 16-ago ya cerró la discrepancia con Cloud SQL (sección 1 de este documento) |
| Puerto hardcodeado que choque con servicios comunes | **Parcialmente confirmado, sin choque real hoy** | Backend 8080, DB dev 5433 (no 5432, a propósito — ver comentario en `docker-compose.yml`), DB test 5434, frontend 3000. Ninguno choca entre sí. El único riesgo real es contra *otros* procesos de la máquina del desarrollador que ya usen 3000/8080/5432 — no verificable desde el código, hay que confirmarlo por máquina |
| CI usa una versión de Postgres distinta a la del compose local | **Descartado — coinciden** | `.github/workflows/ci.yml:31`: `postgres:16`, puerto de host `5434` — mismo valor que `postgres-test` en `docker-compose.yml`. El propio comentario del CI (`ci.yml:19-28`) documenta que ese puerto está hardcodeado a propósito en `vitest.config.ts` y que declarar una copia distinta fue la causa raíz de un bug real ya resuelto (ADR-022) |

### Riesgo nuevo, no pedido explícitamente pero relevante — `.env.local` del frontend sin cubrir por `.gitignore`

`.gitignore` (raíz) tiene:
```
.env
.env.*.local
```
El patrón `.env.*.local` **no cubre** el archivo real `.env.local`
(requiere un segmento entre `.env.` y `.local`, ej. `.env.production.local`
— la convención propia de Next.js). `packages/frontend/.env.local` existe
con una API key de Firebase real y un `project_id` real
(`dpages-be46b`) y, tal como está el `.gitignore` hoy, **no hay ninguna
regla que lo excluya de un commit**. No se pudo confirmar con `git status`
si ya está trackeado o no (el CLI de `git` no está disponible en este
entorno de auditoría — mismo problema ya reportado en la sesión anterior).
Es un riesgo bajo en términos de secreto real (las API keys de Firebase
Web están pensadas para ser públicas, protegidas por las reglas de
seguridad del proyecto, no por su confidencialidad), pero sí vale la pena
corregir el patrón del `.gitignore` a `.env*.local` o agregar
`.env.local` explícito, para que el intento de "nunca commitear datos de
entorno reales" (declarado en el propio `.env.example`) se cumpla también
en el frontend.

---

## Resumen ejecutivo

- **No hay ningún bloqueador real para levantar los tres componentes en
  local hoy.** Todas las variables obligatorias del backend tienen
  placeholder funcional en `.env.example`; el frontend ya tiene su
  `.env.local` con valores reales.
- La discrepancia Postgres 15/16 que motivó este pedido **ya estaba
  resuelta y documentada** desde el 16 de agosto — Postgres 16 es la
  versión real en los tres entornos (local, CI, Cloud SQL).
- Levantar el frontend con el backend arriba **no conecta nada
  automáticamente** — `lib/api.ts` sigue siendo un TODO, el frontend sigue
  100% en mocks pese a que ya existen tanto la variable de entorno
  (`NEXT_PUBLIC_API_URL`) como las dependencias (`firebase`,
  `@tanstack/react-query`, aunque mal ubicadas en el `package.json` raíz).
- Único hallazgo de riesgo real encontrado y no pedido explícitamente: el
  `.gitignore` no cubre `packages/frontend/.env.local`.
