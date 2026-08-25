# Informe de sesión — integración de tipos, HTTP, fechas/decimales y Firebase Auth

**Fecha**: 24 de agosto de 2026 · **Alcance**: `packages/frontend/src` completo,
sobre `packages/shared` y `packages/backend` (sólo lectura, para la
investigación de la tarea 5). Sesión de código, no sólo de auditoría — las
cinco tareas pedidas se ejecutaron en orden, con verificación de compilación
(`tsc --noEmit`, y al final `next build`) entre cada módulo.

**Orden real de ejecución** (con dependencias reales entre tareas, como pedía
la consigna):

1. Tarea 1 — borrado de hooks stub.
2. Tarea 2 — migración de tipos, módulo por módulo: `categories` → `catalog`
   → `tarifes` → `clients` → `comandes` → `panells` → `rendiments-porcs`.
3. Tarea 3 — capa HTTP en `lib/api.ts` (depende de que los tipos de la
   tarea 2 ya estén migrados).
4. Tarea 4 — `lib/dates.ts` y `lib/decimals.ts` (depende de que los mocks ya
   tengan la forma real del contrato, tarea 2 — por eso se aplicó de forma
   más completa de lo que la consigna anticipaba, ver sección 4).
5. Tarea 5 — investigación (5a) antes que código; 5b y 5c después,
   dependiendo de la capa HTTP de la tarea 3 para `GET /jo`.

**Ninguna tarea quedó bloqueada por otra.** La única dependencia real entre
tareas (5c necesita la capa HTTP de la tarea 3) ya estaba resuelta por el
orden de ejecución. `AUTH_DISABLED` no se tocó en ningún `.env` real, tal
como pedía la consigna.

**Verificación**: `npx tsc --noEmit` limpio (código de salida 0) después de
cada módulo/tarea, y `npm run build` (Next.js, producción, con prerender
estático de las 19 rutas) limpio al final de la sesión completa. No se probó
interactivamente en navegador (no hay Playwright ni acceso a browser en este
entorno) — la verificación es de compilación y build, no de UX pixel a
pixel.

---

## 1. Borrar los hooks stub (`useComandes`, `useTarifes`)

**Hallazgo**: confirmado exactamente lo que decía la auditoría previa —
ambos son cáscaras vacías (`return undefined`) sin una sola importación en
todo `src/` fuera de sí mismos. Búsqueda dirigida (`grep -r "useComandes|useTarifes" src/`)
antes de borrar: sólo aparecían en su propia declaración.

**Acción**: borrados `hooks/useComandes.ts` y `hooks/useTarifes.ts`. No
apareció ningún hallazgo nuevo (ningún componente los importaba, a
diferencia de lo que hubiera obligado a avisar antes de tocar nada).

---

## 2. Migración de tipos a `@dpages/shared`

### Decisión de diseño: `lib/api.ts` sigue siendo el único punto de import

En vez de que cada hook/componente importe tipos directamente de
`@dpages/shared`, `lib/api.ts` los re-exporta (`export type { ProducteApi, ... } from "@dpages/shared"`).
Mantiene la convención que el propio archivo ya declaraba ("todo tipo que
viaja entre frontend y backend se define acá") sin tener que tocar el import
de cada archivo consumidor — sólo los nombres de campo, que sí cambian.

### Hallazgo: `@dpages/shared` no era una dependencia declarada del frontend

`packages/frontend/package.json` no tenía `@dpages/shared` en
`dependencies` — el paquete estaba disponible en `node_modules` sólo por
hoisting de npm workspaces, no por una declaración explícita. Se agregó
(`"@dpages/shared": "*"`, mismo criterio que usa `packages/backend/package.json`)
y se corrió `npm install` en la raíz.

### Módulo `categories`

Migrado `CategoryApi` → `CategoriaApi` (`id: string`→`number`,
`name`→`nom`). Archivos tocados: `lib/api.ts`, `mocks/categories.ts`,
`hooks/useCategories.ts`, `app/categories/page.tsx`,
`app/categories/CategoryFormModal.tsx`. `agrupacioRendiment` pasó de
`string | null` (sin restricción) a `'KG' | 'MAGRE' | 'PAQ' | null` — el
`<select>` del modal necesitó un cast explícito (`value as AgrupacioRendiment`)
porque sus opciones vienen de un array `string[]` genérico.

### Módulo `catalog`

Migrado `ProductApi` → `ProducteApi`. Cambios de forma no triviales:

- `weightKg: number` → `pesKg: string | null` — el mock tenía
  `weightKg: 0` para el artículo "a medida" (`BOTPERTNP`); se tradujo a
  `pesKg: null`, el sentinela real del contrato (mismo concepto, sentinela
  distinto — exactamente el riesgo que señalaba `AUDITORIA_FRONTEND.md` §9).
- `category: string` (nombre) → `categoria: {id, nom} | null` — referencia
  real, no join por string.
- `packaging`/`format` (nombres en inglés, valores en catalán) →
  `envasat`/`format` (nombres y valores ya en catalán, sin cambio de
  valores reales: los datos del mock ya usaban `"NORMAL"`, `"TALLAT"`, etc.).
- Nuevo campo obligatorio `tipus: 'simple' | 'variable'` — no existía en el
  mock viejo; se asignó `'simple'` a los 8 productos (todos lo son en los
  datos de ejemplo).

`ProductForm.tsx` reescrito: el selector de categoría ahora resuelve el
objeto `{id, nom}` completo al guardar, no sólo el nombre.

### Módulo `tarifes`

**Hallazgo de contrato, no de tipos**: `FilaMatriuTarifesApi` (`GET /tarifes/matriu`,
contrato §4.3) **no trae `categoria` ni `format`** — sólo
`producteId/codi/descripcio/preus`. El mock viejo (`ProductRateApi`) sí
tenía esos dos campos, duplicados a mano (ya señalado como riesgo en
`AUDITORIA_FRONTEND.md` §4: "dos fuentes de verdad para el mismo dato").

Resuelto cruzando por `producteId` contra `useCatalog()` en
`app/rates/page.tsx` (`categoryByProductId`/`formatByProductId`,
`Map<number, string>`), en vez de seguir inventando el dato en el mock —
es el patrón que la propia auditoría anterior señalaba como correcto.
**Con los datos de ejemplo de hoy, la mayoría de las filas no cruza**: el
mock de tarifas (`BOTTN6`, `COLLTN`, `DONBLTNW`, `GARRTE`, `PICTN250`) usa
SKUs que no existen en el mock de catálogo — sólo `CTLLTATN` y `HAMTN2`
coinciden. Es un gap de **datos** preexistente entre dos mocks, no algo que
esta tarea debía resolver (no es un cambio de tipos) — quedan con
categoría/format en "—". Documentado con comentario en `mocks/rates.ts`.

Se le asignaron `producteId` sintéticos 101-107 (fuera del rango 1-8 del
catálogo) para no fingir un cruce que no existe.

`TariffApi`→`TarifaResumApi` (`code`→`codi`, `name`→`nom`, `+id: number`).
`ProductRateApi.prices: Record<string, number>` → `FilaMatriuTarifesApi.preus: Record<string, string | null>`
(decimales como string, clave = id de tarifa en texto en vez de código).

### Módulo `clients` (incluye `carriers`/transportistas, misma sección del contrato)

`ClientTariffApi`→`ClientApi` (agrega `nif`/`email`/`telefon`/`actiu`/`transportistaDefecte`,
que el mock viejo no tenía). `CarrierApi`→`TransportistaApi` (agrega `actiu`).
El campo `tariffCode: string | null` (join por código) se reemplazó por
`tarifa: {id, nom} | null` — referencia embebida, ya no hace falta cruzar
contra `tariffColumns` en cada pantalla (`ClientFormModal.tsx` simplificado).

### Módulo `comandes`

El de mayor superficie de cambio. `OrderApi` (una sola forma plana,
cabecera+líneas) se reemplazó por `ComandaDetallApi` (cabecera con
`linies: ComandaLiniaApi[]` embebidas) — el mock/hook siguen devolviendo
la forma "detalle completa" en el listado (no la forma liviana
`ComandaResumApi` que usaría un `GET /comandes` real), porque esta tarea no
conecta HTTP todavía y las pantallas necesitan las líneas para poder
listar/filtrar por fecha de producción de línea, igual que antes.

Cambios de fondo, no sólo de nombre:

- `status: "Oberta" | "Incidència"` (2 valores) → `estat: string` con los 4
  valores reales del contrato (`oberta`/`en_proces`/`tancada`/`amb_incidencia`).
  Se agregó un mapa `ESTAT_LABELS` en cada pantalla que lo muestra (no hay
  un lugar central de labels de comanda todavía — podría valer la pena
  centralizarlo si se sigue tocando este código).
- `clientCode`/`tariffCode`/`carrierCode` (strings, join por código) →
  `client`/`tarifa`/`transportista` embebidos (`{id, nom}` o
  `{id, nom, poblacio}`) — ya resueltos, no hace falta cruzar contra
  `useClientTariffs()`/`useRates()`/`useCarriers()` sólo para mostrar el
  nombre. Esto **simplificó** varias pantallas (`office/[number]/page.tsx`
  dejó de necesitar `useRates().data` para resolver precio por línea: ahora
  `ComandaLiniaApi.preuUnitari`/`totalLinia` ya vienen calculados).
- `lines`→`linies`, `OrderLineApi`→`ComandaLiniaApi`: gana `preuUnitari`,
  `totalLinia`, `kgEditable`, `confirmatA`, `categoria`/`format`/`envasat`
  (capa 20 del contrato, ya resueltos por línea), `esborrat`. En el
  formulario (`OrderForm.tsx`) estos se recalculan en el cliente al elegir
  producto/unidades (`preuUnitari` = `producte.preuVenda`, cascada de
  tarifa **no** replicada en el frontend — es lógica de backend, contrato
  §6, "nunca a calcular en el frontend"; el mock hace la aproximación más
  simple posible a propósito).
- Nuevos campos sin ningún reflejo en el frontend viejo, ahora tipados pero
  **sin UI nueva** (fuera de alcance de esta tarea, que es de tipos):
  `congelada`/`congelatA`, `incidencies[]`, `origen`.
- Fechas: pasaron de `"YYYY-MM-DD"` a ISO-8601 con hora. Esto **rompió dos
  filtros de fecha** que comparaban el valor crudo contra un `<DateInput>`
  (que da `"YYYY-MM-DD"`) — se corrigieron con `.slice(0, 10)` en
  `app/orders/page.tsx` y `app/office/page.tsx` durante esta misma tarea
  (antes de la tarea 4, que es la que formalmente centraliza fechas) porque
  si no directamente no compilaba el flujo de filtrado.

### Módulo `panells` (Oficina/Obrador/Empaquetat)

`hooks/useObradorPanell.ts` y `hooks/usePackagingPanell.ts` son los dos
hooks que el código ya marcaba como "aislados" (`ObradorLine`/`PackagingLine`,
sin sufijo `Api` a propósito). Se simplificaron notablemente: como
`ComandaLiniaApi` ya trae `categoria`/`format`/`envasat`/`producte` y
`ComandaDetallApi` ya trae `client`/`transportista` embebidos, **dejaron de
necesitar cruzar contra `mocks/catalog.ts`/`mocks/clientTariffs.ts`/`mocks/carriers.ts`**
— antes hacían `Promise.all([getMockOrders(), getMockCatalog(), getMockClientTariffs()])`
y ahora sólo `getMockOrders()`. Es una simplificación real, no cosmética:
menos superficie de por dónde puede desincronizarse un dato.

`app/workshop/page.tsx` y `app/packaging/page.tsx` tenían el mismo bug de
filtro de fecha que `orders`/`office` (comparación directa contra
`"YYYY-MM-DD"`) — corregido en el mismo paso.

### Módulo `rendiments-porcs` (incluye Panell Producció)

`PigYieldApi`→`RendimentPorcApi`. Cambio de fondo: el alta
(`RendimentPorcEntradaApi`) ya no permite elegir categoría/agrupació a mano
— se eligen por `producteId`, y `agrupacioRendiment`/`categoria`/`agrupacioProduccio`
se derivan del producto (exactamente como especifica el contrato §4.9: "de
sólo lectura, se derivan en cada lectura"). `PigYieldFormModal.tsx` se
reescribió para reflejar esto: el formulario elige un producto, no una
categoría+agrupació sueltas — más fiel al contrato, aunque cambia la UX del
modal (de 4 selects a 1 select + 2 campos de solo-lectura derivados).

`lib/productionCalculations.ts` perdió su parámetro `products` en
`aggregateProductDemand`/`aggregateElaboratedDemand`: ya no hace falta
cruzar por código de producto porque `ComandaLiniaApi.kgDemanats` viene
precalculado y `ComandaLiniaApi.categoria` ya viene resuelto por nombre.

### Limpieza final

`lib/api.ts` tenía tipos manuales que quedaron **sin ningún import** tras
migrar todo (`ClientTariffApi`, `CarrierApi`, `OrderLineApi`, `PigYieldApi`,
`OrderApi`) — TypeScript no marca exports sin uso como error, así que
sobrevivieron a varias pasadas de `tsc --noEmit` en verde antes de que los
detectara con un `grep` dirigido al final. Borrados. `UserApi`/`UserRole`
se dejaron a propósito (ver sección 5).

---

## 3. Capa HTTP en `lib/api.ts`

- `API_BASE_URL = \`${NEXT_PUBLIC_API_URL}/api/v1\`` — la variable de
  entorno sólo trae el host (`http://localhost:8080`); el prefijo
  `/api/v1` lo agrega el cliente (contrato §2).
- `ApiError` (clase, no objeto plano) con `codi` (`CodiErrorApi` del
  contrato + `"ERROR_XARXA"`/`"RESPOSTA_INVALIDA"`, dos códigos propios del
  cliente para cuando `fetch` nunca llega a tener una respuesta con la
  forma `{error: {...}}` del contrato), `missatge`, `status`, `detalls`.
- `api.get/post/patch/delete` — objeto, no funciones sueltas
  (`delete` es palabra reservada como declaración top-level en JS, pero
  válida como propiedad de objeto).
- **Punto de inyección del token** (`setAuthTokenProvider`): tal como pedía
  la consigna para no bloquear esta tarea por la 5, quedó como una función
  reemplazable, con default `async () => null`. La tarea 5c la conecta de
  verdad (`hooks/useAuth.tsx` la llama una vez, a nivel de módulo).
- `Accept-Language: ca` fijo en cada request (contrato §2, default del
  proyecto) — no pedido explícitamente por la consigna, pero es gratis y
  correcto tenerlo desde ahora.
- **Nada llama a esto todavía**: los hooks siguen 100% sobre mocks, tal
  como pedía la consigna ("no conectes las llamadas HTTP reales todavía").

---

## 4. `lib/dates.ts` y `lib/decimals.ts`

### `lib/dates.ts`

Una sola función, `formatData(isoDateTime, includeTime: boolean)`, con
`Intl.DateTimeFormat` locale `en-GB` (dos formateadores, fecha y hora por
separado, unidos con un espacio — evita la coma que meten los locales
`es-ES` al combinar `dateStyle`+`timeStyle` en un mismo formateador) y
`timeZone: "Europe/Madrid"`.

**Criterio aplicado, campo por campo** (pedido explícito de la consigna:
"documentá en el propio código el criterio... y reportá qué decidiste para
cada una"):

| Campo | Con hora? | Motivo |
|---|---|---|
| `dataComanda` | **No** | Es el ejemplo textual de la propia consigna ("fecha de pedido en un listado") — fecha de referencia, no un evento puntual para estas pantallas. |
| `dataProduccio` (cabecera y línea) | **No** | Ejemplo textual de la consigna ("fecha de producción"). |
| `dataExpedicio` | **Sí** | Ejemplo textual de la consigna ("hora de envío"). |
| `dataLliurament` | **Sí** | Ejemplo textual de la consigna ("hora de entrega"). |

Pantallas y campos afectados, confirmado por `grep` dirigido (la auditoría
anterior estimaba "~10 pantallas"; el recuento real de archivos que usan las
dos funciones duplicadas es **5**, con 12 call sites):

- `app/orders/page.tsx`: `dataComanda` sin hora, `dataLliurament` con hora
  (mismo listado, dos criterios distintos — correcto según la tabla).
- `app/office/page.tsx`: `dataComanda` sin hora, `dataExpedicio`/`dataLliurament`
  con hora. Reemplaza además a `formatDateShort` (formato `DD/MM` sin año,
  local a ese archivo) — la consigna nombra explícitamente esta función
  para reemplazar, así que ahora esas columnas muestran año completo
  (`DD/MM/YYYY`), un cambio visual menor pero deliberado y pedido.
- `app/office/[number]/page.tsx`: mismo criterio que `office/page.tsx`.
- `app/workshop/page.tsx`: `dataProduccio` (de la línea) sin hora. Se
  corrigió además el filtro de fecha (comparaba el ISO-con-hora contra el
  valor de un `<DateInput>`, nunca iba a matchear — mismo bug que ya se
  había corregido en `orders`/`office` durante la tarea 2, faltaba acá).
- `app/packaging/page.tsx`: `dataExpedicio`/`dataLliurament` (a nivel de
  línea empaquetada) con hora. Mismo fix de filtro de fecha que en
  `workshop`.

`lib/orderCalculations.ts` (`aggregateProductionDates`) usa la función
centralizada con `includeTime: false`.

### `lib/decimals.ts`

Dos funciones: `formatDecimal(value: string | null, decimals)` (mostrar) y
`parseDecimalInput(value: number | string, decimals)` (enviar). La
consigna preveía que los mocks **todavía no** tendrían la forma real al
llegar a esta tarea ("no cambies los tipos de los mocks todavía") — en esta
sesión eso ya no aplicaba porque la tarea 2 se hizo primero y de punta a
punta, así que los mocks **ya son** `string` decimal. Eso permitió aplicar
la utilidad de forma más completa de lo que la consigna anticipaba.

**Aplicada** (7 archivos, todos casos limpios: formatear un campo `string`
del contrato directo, sin cálculo intermedio, o convertir un número de
formulario a string antes de enviarlo):

- `app/catalog/page.tsx` (mostrar: `pesKg`, `preuVenda`)
- `app/office/[number]/page.tsx` (mostrar: `kgDemanats`/`kgLliurats`/`preuUnitari`/`totalLinia`)
- `app/catalog/ProductForm.tsx` (enviar: `pesKg`, `preuVenda`)
- `app/pig-yields/PigYieldFormModal.tsx` (enviar: `unitatsPerPorc`, `kgPerUnitat`)
- `app/pig-yields/page.tsx` (enviar, x2: fila de tabla y de tarjeta)
- `app/rates/page.tsx` (enviar: `preus` al guardar una celda)

**No aplicada, a propósito** — `.toFixed()` sobre un **número derivado**
(suma, cálculo de rendimiento, agregado), no sobre un campo `string` crudo
del contrato: `lib/productionCalculations.ts`, `lib/pigYieldCalculations.ts`,
`mocks/orders.ts`, `mocks/pigYields.ts`, `hooks/usePackagingPanell.ts`,
`hooks/usePigYields.ts`, y la mayor parte de `app/orders/OrderForm.tsx`
(cálculo de `totalLinia`/`kgDemanats` en vivo mientras se edita una línea).
Tocar estos hubiera significado reescribir lógica de cálculo, no sólo
sustituir un formateo — fuera del "si es rápido, aplicala ya" de la
consigna. `app/workshop/page.tsx`, `app/packaging/page.tsx`,
`app/production/page.tsx`, `app/office/page.tsx` (los cuatro `formatKg`
locales que quedan) formatean **números** de tipos de vista derivados
(`ObradorLine`, `PackagingLine`, `ProductionRow`), no strings del contrato
— mismo motivo.

---

## 5. Firebase Auth real

### 5a. Investigación — ¿hace falta el Admin SDK completo para verificar un token?

**Respuesta corta: no.** El propio código y `.env.example` ya lo documentan
con precisión — el comentario de `env.ts` ("opcional, sólo hace falta para
POST /usuaris") **es exacto, no es un gap de validación.**

**Evidencia** (`packages/backend/src/http/auth-firebase.ts`):

Hay **dos apps de Firebase separadas** en ese archivo, con dos propósitos
distintos:

1. `obtenerAppFirebase()` (línea 43) — la que usa
   `verificarTokenFirebase` (línea 114) en **cada** petición de negocio.
   Se inicializa con `initializeApp()` **sin ningún argumento de
   credencial** — Application Default Credentials. El comentario del
   propio código (líneas 47-51) lo explica: en Cloud Run alcanza con el
   service account de la instancia; en local, si alguna vez se prueba
   contra el proyecto real, hace falta `GOOGLE_APPLICATION_CREDENTIALS`
   (variable estándar del SDK de Google, no una variable propia del
   proyecto — no está en el esquema de `env.ts` porque no la lee la app,
   la lee la librería de Google por debajo).
2. `obtenerAppFirebaseAdmin()` (línea 85) — usada **sólo** por
   `gestioUsuarisFirebase` (`crearUsuari`/`esborrarUsuari`/`generarLinkEstabliment`,
   capa 19, `POST /usuaris`). Esta sí necesita `FIREBASE_ADMIN_SDK_KEY_JSON`
   (credencial explícita, `cert()`) — el comentario explica por qué
   (líneas 66-78): Identity Toolkit gestiona sus propios permisos por
   fuera de IAM de GCP, y el service account de la instancia de Cloud Run
   nunca tuvo acceso real ahí pese a sus roles de IAM a nivel de proyecto
   (hallazgo de una prueba manual anterior, documentado en el propio
   comentario).

`verificarTokenFirebase` sólo llama a `getAuth(app).verifyIdToken(token)` —
el comentario en la línea 111-112 lo dice explícito: *"`verifyIdToken` ya
valida firma, expiración, `aud`/`iss` contra el proyecto de Firebase — no
hay nada más que chequear acá"*. Esa verificación de firma se hace contra
las claves públicas de Google (no requiere ninguna credencial privada); lo
único que sí necesita la app inicializada es poder determinar el
`project_id` del proyecto de Firebase para validar el claim `aud` — dato
que, en este código, sale de las credenciales por defecto (ADC) que
`initializeApp()` intenta resolver, no de `FIREBASE_ADMIN_SDK_KEY_JSON`.

**Conclusión práctica para cuando alguien decida apagar `AUTH_DISABLED`**:
no hace falta generar ni pegar `FIREBASE_ADMIN_SDK_KEY_JSON` para que la
verificación de tokens funcione — esa variable sigue siendo, como dice el
comentario, específica de `POST /usuaris`. Lo que sí hace falta (fuera de
Cloud Run) es `GOOGLE_APPLICATION_CREDENTIALS` apuntando a alguna
credencial de Google válida para el proyecto `dpages-be46b` — no
necesariamente una clave de servicio descargada, cualquier ADC sirve (por
ejemplo, `gcloud auth application-default login`). Esto **no se verificó
ejecutando el código** (no hay forma de probarlo sin credenciales reales
contra el proyecto) — es una lectura precisa del código y de cómo el SDK de
Firebase Admin documenta `verifyIdToken` en general, no una confirmación
empírica.

**No se tocó `AUTH_DISABLED` en ningún `.env` real**, tal como pedía la
consigna — sigue en `true` en `.env` y en `.env.example`.

### 5b. `lib/firebase.ts`

Implementado con el SDK modular (`firebase/app`, `firebase/auth` — no el
paquete `firebase` completo, para no traer Firestore/Storage/etc. sin usar).
Sin `getAnalytics`, tal como pedía la consigna.

**Hallazgo**: `packages/frontend/.env.local` **ya tenía las seis variables
`NEXT_PUBLIC_FIREBASE_*` completas** (`API_KEY`, `PROJECT_ID`,
`AUTH_DOMAIN`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`, todas con
valores del proyecto `dpages-be46b`) — la consigna asumía que sólo había
dos y que había que agregar placeholders para las otras cuatro. No hizo
falta agregar nada. Vale la pena que Michelle confirme si esos valores son
los vigentes (no se puede verificar desde acá si están actualizados).

`firebase` tampoco estaba declarado en `packages/frontend/package.json`
(estaba disponible por hoisting, agregado a `dependencies` del **root**
`package.json` en algún momento anterior a esta sesión — igual que
`@tanstack/react-query`, que tampoco usa ningún hook todavía). Se agregó
`"firebase": "^12.17.1"` a `packages/frontend/package.json`, que es el
paquete que realmente lo consume. **No se tocó el `package.json` de la
raíz** — si `firebase`/`@tanstack/react-query` ahí fue deliberado (por
ejemplo, para alguna herramienta a nivel de monorepo) o un descuido de
ubicación, es algo para que decida Michelle; quedó documentado acá en vez
de removido sin preguntar.

### 5c. `useAuth.tsx`

Los cuatro reemplazos mecánicos que pedía la consigna, todos hechos:

- `login()`: `validateCredentials` → `signInWithEmailAndPassword(auth, email, password)`.
- Hidratación: `localStorage` + `getMockUsers().find(...)` → `onAuthStateChanged(auth, callback)`.
- `logout()`: `localStorage.removeItem(...)` → `signOut(auth)`.
- Cada request de la capa HTTP (tarea 3) manda `Authorization: Bearer <token>`:
  conectado vía `setAuthTokenProvider(async () => auth.currentUser ? auth.currentUser.getIdToken() : null)`,
  llamado una sola vez al importar `useAuth.tsx` (que siempre se importa,
  porque `AuthProvider` envuelve toda la app en `app/layout.tsx`).

**Decisión de diseño no mecánica, necesaria para que esto compile**: la
consigna dice *"el rol ya no sale de una columna de mock — sale de `GET /jo`... `UserApi.password` deja de existir"*. Tomado literalmente, eso
significa que el usuario autenticado real deja de ser `UserApi` (el tipo
mock, con 4 roles fijos `office/workshop/packaging/production` y
`password`) y pasa a ser `UsuariApi` de `@dpages/shared` (`rol: {id, nom, modulsPermesos}`,
sin `password`). Pero `UserApi`/`UserRole` siguen siendo el tipo que usa
**toda la pantalla `/users`** (`useUsers.ts`, `UserFormModal.tsx`,
`users/page.tsx`, `mocks/users.ts`) — un CRUD completo, mock, sobre un
modelo de roles que **no existe en el backend real** (que sólo tiene
`Administrador`/`General`). Esa pantalla ya estaba señalada como hallazgo
crítico sin resolver en `AUDITORIA_FRONTEND.md` §3/§8, y **no está en el
alcance de esta sesión** (no aparece en la lista de módulos de la tarea 2,
y la tarea 5 sólo nombra `useAuth.tsx`).

Se resolvió así: `useAuth.tsx` pasa a usar `UsuariApi` (importado de
`lib/api.ts`, que ahora lo re-exporta desde `@dpages/shared`) para el
usuario autenticado real. `UserApi`/`UserRole` se dejaron intactos en
`lib/api.ts`, con un comentario nuevo explicando que son exclusivos del
mock de `/users` y no representan la sesión real. Esto obligó a tocar,
además de `useAuth.tsx`:

- `lib/roles.ts`: se agregó un juego de funciones nuevo
  (`MODUL_ROUTES`, `firstAllowedRouteForModules`, `isModuleRouteAllowed`)
  que trabaja contra `modulsPermesos: string[]` (lo real), mapeando cada
  ruta existente a la clave de módulo real del contrato (`categories`,
  `catalog`, `tarifes`, `tarifes-clients`, `comandes`, `rendiments-porcs`,
  `panell-oficina`, `panell-obrador`, `panell-empaquetat`,
  `panell-produccio`, `usuaris`). **Las funciones viejas basadas en
  `UserRole` (`ROLE_ROUTES`, `ROLE_LABELS`, `firstAllowedRoute`,
  `isRouteAllowed`) se dejaron sin tocar**, exclusivas del mock de
  `/users`.
- `components/auth/AuthGuard.tsx`, `components/layout/Sidebar.tsx`,
  `app/(auth)/login/page.tsx`, `app/profile/page.tsx`: pasan a leer
  `user.rol.modulsPermesos`/`user.nom`/`user.rol.nom`/`user.actiu` (forma
  real) en vez de `user.role`/`user.name`/`user.status` (forma mock).

**Hallazgo de negocio, no nuevo pero re-confirmado acá**: el mecanismo de
restricción de navegación por módulo **sigue existiendo** en el frontend
(mismo comportamiento que antes, sólo que ahora contra `modulsPermesos`
real en vez de un rol inventado) — la propia `AUDITORIA_FRONTEND.md` §1/§9
ya señaló que el backend documentó explícitamente que **ningún** endpoint
debería restringir por rol/módulo (`modulsPermesos` es sólo para decidir
qué mostrar en el menú, ADR-021). Esta sesión no decide si esa restricción
de navegación debería sacarse del todo — sigue siendo una decisión de
producto pendiente, ahora simplemente corriendo sobre el dato real en vez
de uno ficticio.

**Pantalla `/users` (`useUsers.ts`, `UserFormModal.tsx`, `users/page.tsx`,
`mocks/users.ts`) quedó sin tocar, a propósito** — compila y funciona
exactamente igual que antes de esta sesión (mock de 4 roles fijos +
password en texto plano), pero está completamente desconectada del
mecanismo de auth real. Migrarla a `UsuariApi`/`RolApi` reales (sin roles
fijos, con `modulsPermesos`, sin gestión de contraseña porque eso lo hace
`POST /usuaris` vía `linkEstabliment`) es trabajo pendiente, no incluido en
ninguna de las 5 tareas de esta sesión.

---

## 6. Estado final

`npx tsc --noEmit` (packages/frontend): **0 errores**.
`npm run build` (Next.js, producción): **compila y prerenderiza las 19
rutas sin error**.

Pendiente explícito para la próxima sesión (ninguno bloqueó esta):

- Conectar los hooks a la capa HTTP real (tarea 3 sólo dejó la capa lista,
  no reemplazó ningún mock — es "trabajo pantalla por pantalla" según la
  propia consigna).
- Migrar `/users` a `UsuariApi`/`RolApi` reales, y decidir qué hacer con la
  restricción de navegación por módulo (sección 5c).
- Confirmar con Gerardo/Michelle si los seis valores `NEXT_PUBLIC_FIREBASE_*`
  ya presentes en `.env.local` son los vigentes.
- Decidir si `firebase`/`@tanstack/react-query` en el `package.json` de la
  raíz fue deliberado.
- Probar `AUTH_DISABLED=false` contra el proyecto real requiere
  `GOOGLE_APPLICATION_CREDENTIALS` local (sección 5a) — no verificado
  empíricamente en esta sesión.
