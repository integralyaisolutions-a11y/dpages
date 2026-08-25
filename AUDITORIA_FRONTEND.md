# Auditoría del frontend de dPagès — estado actual

**Fecha**: 24 de agosto de 2026 · **Alcance**: `packages/frontend/src` completo
(`app/`, `hooks/`, `lib/`, `mocks/`, `components/`), contra
`docs/contrato-api.md`, `docs/openapi.yaml` y `packages/shared` del backend.

Documento exclusivamente de inventario/documentación — no se modificó código
en esta pasada. Sirve de base para planificar, en otra conversación, la
integración del frontend contra el backend real.

**Nota sobre el archivo `dPages_Enfoque_Desarrollo_Frontend.md`**: no se
encontró en el repositorio (búsqueda por nombre en todo el árbol sin
resultados). Los "4 puntos calientes" de la sección 5 se reconstruyeron
directamente desde los comentarios que quedaron en el código
(`useObradorPanell.ts`, `usePackagingPanell.ts`, `useComandes.ts`,
`useTarifes.ts`), que son la única fuente que sobrevive hoy en el repo.

**Hallazgo transversal, antes de entrar en el detalle**: el frontend **no
importa nada de `@dpages/shared`** — se verificó con una búsqueda dirigida
sobre todo `packages/frontend/src` y no hay una sola referencia al paquete.
Todos los tipos de contrato (`lib/api.ts`) están reescritos a mano, en
inglés, con nombres de campo que no coinciden con los tipos `*Api` reales del
backend (`ProducteApi`, `ComandaApi`, etc., en catalán). Esto es la raíz de
buena parte de los hallazgos de las secciones 3, 7 y 9: la integración no es
"cambiar de dónde vienen los datos", es reconciliar dos contratos que
evolucionaron por separado.

---

## 1. Inventario de rutas

| Ruta | Pantalla | Rol(es) con acceso | Tipo | CRUD |
|---|---|---|---|---|
| `/login` | Login | pública (sin sesión) | formulario | — |
| `/` | Plantilla por defecto de `create-next-app` | — | — | **Código muerto**: no está en `PUBLIC_ROUTES` ni `SHARED_ROUTES` ni en ningún `ROLE_ROUTES`, así que `AuthGuard` redirige siempre a `firstAllowedRoute(role)` antes de que se vea. Nunca se renderiza en la práctica. |
| `/profile` | Mi perfil | cualquier rol autenticado (`SHARED_ROUTES`) | detalle, solo lectura | — |
| `/categories` | Categories de producte | production | listado + modal | Completo: create/edit/delete (modal). Sin ruta de detalle propia. |
| `/catalog` | Catàleg | production | listado | **Parcial**: create (`/catalog/new`) + edit (`/catalog/[code]/edit`). **Sin delete**, en ningún lado. |
| `/catalog/new` | Nou producte | production | formulario (create) | — |
| `/catalog/[code]/edit` | Modificació de producte | production | formulario (edit) | — |
| `/rates` | Llistat de Tarifes | office, production | listado + edición en línea | Parcial: lectura de la matriz + update de precio por celda + alta de tarifa (columna nueva). Sin delete de tarifa ni de fila de producto. |
| `/client-tariffs` | Tarifes per client | office, production | listado + modal | Parcial: create/edit. Sin delete. |
| `/orders` | Comandes | office, production | listado | Parcial: create (`/orders/new`) + edit (`/orders/[number]`) + "marcar incidència" (transición de estado, no CRUD). Sin delete de comanda. |
| `/orders/new` | Nova comanda | office, production | formulario (create) | — |
| `/orders/[number]` | Comanda (detalle/edición) | office, production | formulario (edit) | Incluye eliminar líneas individuales dentro del formulario (no persistido aparte). |
| `/pig-yields` | Rendiments Porcs | production | listado editable en línea + modal | Completo: create (modal) + update (inline) + delete. |
| `/office` | Panell d'Oficina | office, production | panel de solo lectura | — (navega a `/office/[number]`) |
| `/office/[number]` | Detalle de comanda (oficina) | office, production | detalle, solo lectura | — |
| `/workshop` | Panell d'Obrador | workshop, production | panel de solo lectura | — |
| `/packaging` | Panell d'Empaquetat | packaging, production | panel con edición en línea | Parcial: sólo `update` de `deliveredUnits`/`deliveredWeightKg` por línea. Sin create/delete (no aplica). |
| `/production` | Panell Producció | production | panel de solo lectura + un input de simulación (`pigsToProduce`) | — |
| `/users` | Administració d'usuaris | production | listado + modal | Completo: create/edit/delete. **Ver hallazgo crítico en sección 3/8**: no hay endpoint de usuarios en el contrato — este CRUD no tiene contraparte de backend documentada. |

**Sobre "rol(es) con acceso"**: viene de `lib/roles.ts` (`ROLE_ROUTES`) +
`AuthGuard`/`Sidebar`, que **restringen de verdad la navegación por rol**
(un usuario `workshop` literalmente no puede llegar a `/orders` — se lo
redirige). Esto contradice lo que el backend tiene confirmado y
documentado en ADR-021 y `docs/contexto-negocio.md`: *"no hace falta
restringir accesos por rol — todo el mundo ve todo; el rol sólo decide en
qué panel lo ubica el sistema por defecto al entrar"*. El frontend
implementó una restricción real donde el backend explícitamente decidió no
tener ninguna. Es una inconsistencia de regla de negocio que hay que
resolver antes de integrar (ver también sección 6).

---

## 2. Inventario de hooks y su relación con mocks

| Hook | Mock(s) consumidos | Operaciones expuestas | ¿Aislado? |
|---|---|---|---|
| **`useObradorPanell`** | `orders.ts`, `catalog.ts`, `clientTariffs.ts` | read (deriva `ObradorLine[]` aplanando líneas de pedido) | **PRIORITARIO** — marcado explícitamente en el código como punto de absorción del contrato Obrador (hoy sin cerrar). Ver detalle en sección 5. |
| **`usePackagingPanell`** | `orders.ts` (read + write vía `updateMockOrder`), `catalog.ts`, `clientTariffs.ts`, `carriers.ts` | read + `saveLineDelivery` (update) | **PRIORITARIO** — mismo criterio que el anterior, marcado explícitamente en el código. |
| `useOrders` | `orders.ts` | read, `createOrder`, `editOrder`, `markIncidence` (update de estado) | No marcado como aislado, pero es **el hook real y funcional de comandas** — ver duplicidad con `useComandes` abajo. |
| `useComandes` | ninguno | ninguna (**stub**: `return undefined`) | Nominalmente aislado (comentario menciona origen/búsqueda), pero **no está implementado ni se usa en ningún componente**. Duplica el propósito de `useOrders` sin reemplazarlo. |
| `useCatalog` | `catalog.ts` | read, `createProduct`, `editProduct` | No. |
| `useCategories` | `categories.ts` | read, `createCategory`, `editCategory`, `deleteCategory` | No. |
| `useClientTariffs` | `clientTariffs.ts` | read, `createClient`, `editClient` | No. |
| `useRates` | `rates.ts` | read (`data` + `tariffColumns`), `updatePrices`, `createTariff` | No marcado como aislado, pero es **el hook real y funcional de tarifas** — ver duplicidad con `useTarifes` abajo. |
| `useTarifes` | ninguno | ninguna (**stub**: `return undefined`) | Nominalmente aislado (comentario menciona `transportistaDefecte`), pero **no está implementado ni se usa en ningún componente**. Duplica el propósito de `useRates` sin reemplazarlo. |
| `useCarriers` | `carriers.ts` | read únicamente | No. Tampoco hay pantalla de mantenimiento de transportistas (no existe `/carriers`). |
| `usePigYields` | `pigYields.ts` | read, `createPigYield`, `updatePigYield`, `deletePigYield` | No. |
| `usePigConfig` | `pigConfig.ts` | read únicamente (no hay `create`/`update` — el config es una constante fija en el mock, sin pantalla de mantenimiento) | No. |
| `useProductionPanell` | `pigYields.ts`, `categories.ts`, `catalog.ts`, `orders.ts` (todo read) | read + cálculo derivado en cliente (`lib/productionCalculations.ts`) | Implícitamente sensible al mismo cruce sin resolver que documenta la sección 6. |
| `useUsers` | `users.ts` | read, `createUser`, `editUser`, `deleteUser` | No. Ver hallazgo crítico: sin endpoint de backend documentado (sección 3). |
| `useAuth` | `users.ts` (`getMockUsers`, `validateCredentials`) | read (hidratar sesión), `login`, `logout` | Es el mecanismo de auth completo — ver sección 8. |
| `useEditableRow` | ninguno (genérico) | helper de estado de formulario (`draft`/`setField`/`save`/`reset`/`isDirty`) | No aplica — no es un hook de datos. |

**Los dos hooks marcados `PRIORITARIO` (`useObradorPanell`,
`usePackagingPanell`) son los únicos que siguen el patrón que el propio
código describe como intencional**: absorber un contrato todavía inestable
en un solo archivo, devolviendo un tipo de vista propio (`ObradorLine`,
`PackagingLine`, deliberadamente sin el sufijo `Api`) en vez del tipo de
contrato. **Los otros dos "puntos calientes" (`useComandes`, `useTarifes`)
nunca llegaron a implementarse** — son cáscaras vacías, mientras que el
trabajo real de comandas y tarifas quedó en `useOrders`/`useRates`, que no
tienen ningún aislamiento explícito del contrato. Esto es relevante para
quien planifique la integración: la intención original (aislar los 4 puntos
calientes en hooks dedicados) sólo se cumplió a medias.

---

## 3. Estructura de tipos actual (`lib/api.ts`)

Todos los tipos llevan sufijo `Api`, según la regla que el propio archivo
declara en su cabecera (comentario, líneas 1-16). Reproducidos completos:

### `CategoryApi`
```
id: string
name: string
elaboratPorc: boolean
agrupacioRendiment: string | null
```
El tipo acepta cualquier string — no está restringido a los 3 valores que el
mock realmente usa (`MAGRE`/`KG`/`PAQ`/`null`). Mismo gap que existe del
lado del backend (ver auditoría de backend, hallazgo I1): ninguno de los dos
lados cerró todavía el enum.

### `ProductApi`
```
code: string
category: string          // referencia por NOMBRE, no por id (ver sección 4)
productionGroup: string   // "Agrupació producció" — sin equivalente en el
                           // contrato del backend hoy (contrato-api.md/
                           // openapi.yaml no tienen este campo en Producte)
description: string
format: string
packaging: string
weightKg: number
basePrice: number
status: "Actiu" | "Inactiu"
```
**Campos marcados en el propio código como dato de mock, no confirmado con
negocio** (comentarios en `mocks/catalog.ts`):
- `basePrice` de `CTLLTATN` (12.5) y `HAMTN2` (6.8): *"no confirmado en la
  data que me pasaste, valor de relleno"*.
- `weightKg` (0.3) y `basePrice` (9.9) de `BACLLW`: *"no confirmados en la
  data que me pasaste, valores de relleno"*.

### `TariffApi`
```
code: string
name: string
```

### `ProductRateApi`
```
productCode: string
category: string
format: string
description: string
prices: Record<string, number | null>   // valores NUMBER, no string
```
**Riesgo de integración**: el contrato del backend (`contrato-api.md`,
sección 2) manda los precios como **string** con 2 decimales
(`"9.50"`), justamente para no perder precisión en JS. Este tipo los espera
como `number`. Es una conversión obligatoria en el borde de integración, no
sólo un cambio de import.

### `ClientTariffApi`
```
code: string
name: string
city: string
tariffCode: string | null
```
No tiene `nif`, `email`, `telefon` ni `actiu` — campos que sí existen en el
`ClientApi` real del backend. Tampoco tiene `transportistaDefecte` (ver
sección 5, punto b).

### `CarrierApi`
```
code: string
name: string
```
Sin `actiu` (el `TransportistaApi` del backend sí lo tiene).

### `OrderLineApi`
```
id: string
productCode: string
productionDate: string | null
orderedUnits: number
deliveredUnits: number
orderedWeightKg: number
deliveredWeightKg: number
productionNotes: string
```
Sin `preuUnitari`, `totalLinia`, `confirmatA`, `confirmatPer`, `esborrat`
(todos existen en `ComandaLiniaApi` del backend). Tampoco tiene un booleano
tipo `kgEditable`: en su lugar, `lib/orderCalculations.ts` **deriva** si el
peso es editable comparando `product.weightKg <= 0` — ver el riesgo
correspondiente en la sección 9.

### `PigYieldApi`
```
id: string
category: string
productionGroup: string
unitsPerPig: number
kgPerUnit: number
```
**Hallazgo crítico**: ni `PigYieldApi` ni el concepto de "Rendiments Porcs" /
"Panell Producció" existen en `contrato-api.md` ni en `openapi.yaml`. Peor
aún: `contrato-api.md`, sección 7 ("Pendiente de definición"), dice
literalmente **"Panell Producció y Rendiments Porcs: El cliente no los
cerró. No se construyen"**. El frontend ya construyó ambas pantallas
completas (CRUD completo en `/pig-yields`, panel funcional en
`/production`), sobre datos 100% inventados en el mock. Esto no es un tipo
mal definido — es una pantalla entera construida por delante de una decisión
de negocio que el propio contrato dice explícitamente que no se debe tocar
todavía.

### `UserRole` / `UserApi`
```
type UserRole = "office" | "workshop" | "packaging" | "production"

id: string
name: string
email: string
password: string   // texto plano, sólo mock — comentario propio: eliminar al integrar Firebase
role: UserRole
status: "active" | "inactive"
```
**Hallazgo crítico** (ver también sección 8): no existe ningún endpoint de
usuarios en `contrato-api.md` ni en `openapi.yaml`. CLAUDE.md y
`docs/contexto-negocio.md` son explícitos: Firebase Auth es *"sólo
autenticación, ningún dato de negocio"* — no hay tabla de usuarios en
Postgres, y la gestión de usuarios/roles de Firebase normalmente se hace vía
Firebase Admin SDK o la consola, no vía una API REST pública de alta/edición/
baja. La pantalla `/users` (CRUD completo, con un campo `password` en texto
plano que viaja hasta el store del mock) necesita una decisión de diseño
completa antes de integrar, no un simple cambio de `getMockUsers()` por una
llamada real.

### `OrderApi`
```
number: string              // usado como ID único, formato "000073"
status: "Oberta" | "Incidència"     // sólo 2 estados
clientCode: string
poblacioDesti: string
tariffCode: string | null
carrierCode: string | null
orderDate: string
deliveryDate: string | null
shippingDate: string | null
packageCount: number
deliveryAddress: string
productionNotes: string
deliveryNotes: string
lines: OrderLineApi[]
```
Diferencias estructurales con `ComandaResumApi`/`ComandaDetallApi` del
backend, todas relevantes para la integración:
- **`status` tiene 2 valores, el backend tiene 4** (`oberta`, `en_proces`,
  `tancada`, `amb_incidencia`). No hay mapeo directo — falta decidir cómo
  colapsar/expandir.
- **No existe el campo `origen`** en absoluto (ni web/email/whatsapp/telefon,
  ni ninguna otra cosa) — pese a que `useComandes.ts` lo menciona como punto
  en discusión, el tipo real (`OrderApi`) nunca llegó a incorporarlo.
- **`number` hace de identificador único y de "número de pedido" a la vez**;
  el backend separa `id` (entero secuencial interno) de `num` (string con
  formato `"2026-0142"`, generado por trigger). El formato del mock
  (`"000073"`, contador simple con padding) no coincide con el formato real
  del backend.
- **Sin `congelada`/`congelatA`**: la regla de congelación al entrar en
  producción (ADR-007), que el contrato marca como comportamiento central
  (`409 CONFLICTE` al editar un pedido congelado), no existe en absoluto en
  el frontend hoy — ni el tipo, ni ninguna pantalla la refleja.
- **Sin `incidencies[]`, `totalIncidencies`, `tipusIncidencia`**: el
  frontend sólo modela "incidencia" como un status binario
  (`"Incidència"`), no como una lista de motivos con detalle, que es como lo
  expone el backend.

---

## 4. Mocks y su relación entre sí

Todos siguen el mismo patrón: un array mutable a nivel de módulo (`let`, o
`const` cuando no hay mutación) + funciones que lo leen/mutan y devuelven la
promesa vía `mockRequest` (`lib/mockClient.ts`, un `setTimeout` que simula
latencia de red).

| Mock | Entidad | Campos (resumen) | Referencia a otros mocks |
|---|---|---|---|
| `categories.ts` | Categorías de producto | `id`, `name`, `elaboratPorc`, `agrupacioRendiment` | Ninguna (es la hoja del grafo) |
| `catalog.ts` | Productos del catálogo | `code`, `category`, `productionGroup`, `description`, `format`, `packaging`, `weightKg`, `basePrice`, `status` | `category` referencia `categories.ts` **por nombre** (`CategoryApi.name`), no por id — join frágil basado en string, no en clave |
| `carriers.ts` | Transportistas | `code`, `name` | Ninguna |
| `pigConfig.ts` | Config fija de rendimiento porcino | `pernilKgPerPig`, `retallsKgPerPig`, `espatllesKgPerPig` | Ninguna |
| `pigYields.ts` | Rendimientos por corte | `id`, `category`, `productionGroup`, `unitsPerPig`, `kgPerUnit` | `category` referencia `categories.ts` por nombre; `productionGroup` se cruza con `catalog.ts` sólo en `lib/productionCalculations.ts`, por heurística de texto (ver sección 6) — no es una referencia real desde el propio mock |
| `clientTariffs.ts` | Clientes + tarifa asignada | `code`, `name`, `city`, `tariffCode` | `tariffCode` referencia `rates.ts` (`tariffColumns[].code`) |
| `rates.ts` | Matriz de tarifas: `tariffColumns` + `productRates` | `productCode`, `category`, `format`, `description`, `prices` (por código de tarifa) | **No importa `catalog.ts`**: duplica a mano `category`/`format`/`description` para cada producto en vez de derivarlos del catálogo — dos fuentes de verdad para el mismo dato de producto, con riesgo real de que diverjan (ej. si se edita la descripción en `/catalog`, la matriz de tarifas sigue mostrando la vieja) |
| `orders.ts` | Pedidos | `number`, `status`, `clientCode`, ..., `lines[]` | `lines[].productCode` referencia `catalog.ts`; `clientCode` referencia `clientTariffs.ts`; `carrierCode` referencia `carriers.ts`; `tariffCode` (heredado del cliente al crear, ver `OrderForm.tsx`) referencia `rates.ts` |
| `users.ts` | Usuarios de login | `id`, `name`, `email`, `password`, `role`, `status` | Ninguna |

**Grafo de dependencias** (flecha = "referencia por código/nombre, sin
import directo del mock — el join lo hace cada hook o página con `.find()`"):

```
categories.ts ←── catalog.ts ←── orders.ts ──→ clientTariffs.ts ──→ rates.ts
                        ↑                                              ↑
                        └──────────── (heurística de texto) ── pigYields.ts
                                                                        ↑
                                                                  categories.ts

orders.ts ──→ carriers.ts

users.ts                     (aislado, sin relación con el resto)
pigConfig.ts                 (aislado, sin relación con el resto)
```

**Importante**: ninguna de estas relaciones está enforced a nivel de datos
— son coincidencias de string que cada componente resuelve por su cuenta
con `.find(item => item.code === ...)`. Si dos mocks se desincronizan (por
ejemplo, un `productCode` en `orders.ts` que ya no existe en `catalog.ts`),
no hay ningún error: el componente simplemente cae al fallback (`??
line.productCode`, `"—"`, etc.). Esto es cómodo para prototipar pero oculta
qué joins son realmente obligatorios (FK) y cuáles son opcionales — algo que
el equipo de integración va a necesitar decidir explícitamente contra el
esquema real (que sí tiene FKs y `NOT NULL`).

---

## 5. Puntos calientes documentados (backend en discusión)

El archivo `dPages_Enfoque_Desarrollo_Frontend.md` ya no está en el repo (ver
nota al inicio del documento). Lo que sigue se reconstruyó de los
comentarios reales que quedaron en el código.

### a) Panell Obrador: agrupado vs. líneas individuales

**Aislamiento**: `hooks/useObradorPanell.ts` completo (líneas 1-91).

**Estado actual del mock**: la implementación de hoy **ya muestra líneas
individuales**, no agrupadas — `orders.flatMap(order => order.lines.map(...))`
produce una fila por línea de pedido, con su propio `id`. El comentario del
archivo (líneas 3-18) deja explícito que esto fue deliberado: *"el día de
mañana el backend podría devolver estas líneas ya agrupadas por article
(GROUP BY)"* — es decir, el frontend anticipó la posibilidad de agrupación,
pero construyó el mock en la forma no agrupada.

**Contraste con el backend real**: la auditoría de backend (sesión previa)
confirmó que `GET /panells/obrador` **hoy agrupa por artículo** (`GROUP BY`
en `panells.ts`), contradiciendo lo que el consultor funcional (Francesc)
pidió en la llamada más reciente (líneas individuales). **El mock del
frontend, sin saberlo, ya está alineado con lo que Francesc pidió, no con lo
que el backend implementa hoy.**

**Qué cambia según cómo se resuelva**:
- Si el backend pasa a líneas individuales (como pidió Francesc): el ajuste
  en `useObradorPanell.ts` es mínimo — reemplazar el `Promise.all([...mocks])`
  por una sola llamada a `GET /panells/obrador` y mapear su forma real a
  `ObradorLine`. La forma resultante (una fila por línea) no cambia.
- Si el backend se queda agrupado: `useObradorPanell.ts` tiene que dejar de
  hacer `flatMap` sobre líneas y en cambio consumir filas ya agrupadas —
  cambio de lógica, no sólo de origen de datos, pero sigue contenido en este
  único archivo (ningún componente de `/workshop` necesita tocarse).

### b) `transportistaDefecte`

**Aislamiento nominal**: comentario en `hooks/useTarifes.ts` (líneas 7-9).

**Estado real**: el hook `useTarifes` es un **stub sin implementar**
(`return undefined`) y no lo usa ningún componente. El campo
`transportistaDefecte` en sí **no existe todavía en ningún tipo del
frontend** — ni en `ClientTariffApi` (que sería el lugar conceptualmente
correcto, ya que en el backend vive en `client`, no en `tarifa`) ni en
ningún mock. El frontend no llegó a modelar este campo todavía.

**Qué cambia según cómo se resuelva**: si el backend confirma que
`transportistaDefecte` no debe existir (como pidió Francesc, según la
auditoría de backend), no hace falta ningún cambio en el frontend — nunca se
construyó. Si en cambio se mantiene, hay que decidir en qué hook/tipo
agregarlo (`ClientTariffApi` es el candidato natural) antes de construir
cualquier pantalla que lo use.

### c) `OrigenComanda`

**Aislamiento nominal**: comentario en `hooks/useComandes.ts` (líneas 6-9).

**Estado real**: mismo caso que el anterior — `useComandes` es un stub sin
implementar, y `OrderApi` (el tipo que sí se usa en producción, vía
`useOrders`) **no tiene ningún campo de origen**. El frontend todavía no
modela si un pedido vino de la web, email, WhatsApp o teléfono.

**Qué cambia según cómo se resuelva**: si el backend termina migrando de
enum fijo a tabla catálogo (como evaluó la auditoría de backend), el
frontend recién tiene que empezar a modelar esto — no hay nada que migrar,
sólo que construir por primera vez. Es responsabilidad de quien planifique
la integración decidir si el campo se agrega directamente en `OrderApi`
(consumiendo `GET /origens` como catálogo) o se sigue postergando.

### d) Búsqueda exacta vs. parcial

**Aislamiento**: **ninguno**. A diferencia de los tres puntos anteriores,
este no tiene un hook dedicado — cada pantalla con buscador reimplementa su
propio filtro inline, todos con el mismo patrón:
`item.campo.toLowerCase().includes(term.toLowerCase())`.

Pantallas afectadas, todas con `SearchInput` + `.includes()`:
- `app/catalog/page.tsx` (`product.description`)
- `app/orders/page.tsx` (`order.number`, cliente por nombre/código)
- `app/office/page.tsx` (cliente por nombre/código)
- `app/client-tariffs/page.tsx` (`client.code`, `client.name`)
- `app/workshop/page.tsx` (`line.productDescription`)
- `app/packaging/page.tsx` (`line.productDescription`, `line.clientName`)
- `app/users/page.tsx` (`user.name`, `user.email`)
- `app/rates/page.tsx` (`product.description`)

**Qué cambia según cómo se resuelva**: si el backend pasa a coincidencia
exacta (o exacta por palabra completa, como podría interpretarse el pedido
de Francesc), **hay que tocar hasta 8 archivos distintos**, uno por
pantalla, porque no existe ningún punto central de búsqueda. Este es el
único de los cuatro puntos calientes que **no sigue el patrón de
aislamiento** que el equipo usó para Obrador y Empaquetat — vale la pena
considerar extraer un hook/utilidad de búsqueda compartida antes de
integrar, para no tener que repetir el cambio 8 veces y arriesgarse a que
alguna pantalla quede con el criterio viejo por descuido.

---

## 6. Reglas de negocio con inconsistencias sin resolver

### Cruce `pigYields.ts` ↔ `catalog.ts` (documentado explícitamente en el código)

En `lib/productionCalculations.ts` (líneas 18-27), comentario textual:

> *"Cruce pendiente de regla de negocio confirmada con el client (mismo caso
> ja deixat pendent a Rendiments Porcs): no hi ha un identificador compartit
> entre l'Agrupació Producció de mocks/pigYields.ts (ex. 'COSTELLA') i els
> codis de mocks/catalog.ts (ex. CTLLTATN). Mentre no es defineixi, es creua
> per coincidència de text [...] un prefix compartit d'almenys 6 caràcters."*

Implementación real: `findMatchingProduct()` compara
`pigYield.productionGroup.trim().toUpperCase()` contra
`product.description.trim().toUpperCase()` y considera "match" cuando
comparten un prefijo de **al menos 6 caracteres** (`MIN_SHARED_PREFIX = 6`).
Es una heurística de texto, no una relación real — afecta a:
- `Panell Producció` (`/production`, vía `useProductionPanell` →
  `buildProductionRow` → `findMatchingProduct`), modos `KG` y `PAQ`.
- Indirectamente a `Rendiments Porcs` (`/pig-yields`), donde
  `productionGroup` es un campo de texto libre sin ninguna validación contra
  el catálogo (`PigYieldFormModal.tsx` sí ofrece un `<select>` de
  `productionGroupOptions` derivado de `catalog.ts`, pero el valor guardado
  sigue siendo texto libre, no una FK).

Cuando el mode es `MAGRE`, el cruce es distinto y sí es un campo real
(`agrupacioRendiment` en `categories.ts`) — el comentario del propio código
lo aclara: *"a diferencia del caso KG/PAQ, este cruce SÍ es un campo real,
no una heurística de texto"* (`aggregateElaboratedDemand`, líneas 72-77).

**Esto no se puede resolver en el frontend por su cuenta**: hace falta que
el backend defina un identificador compartido real entre "agrupación de
producción" (que hoy tampoco existe en el esquema del backend, ver hallazgo
a) de la auditoría de backend) y los artículos del catálogo.

### Otros comentarios de "pendiente"/"no confirmado" encontrados (grep completo sobre `src/`)

- `mocks/orders.ts:51` — *"shippingDate y adreça: no confirmados en la data
  que me pasaste"* (pedido `000074`).
- `mocks/orders.ts:58` — *"Líneas no confirmadas en detalle: producto/unitats
  de relleno, solo las dates de producció [...] vienen de tu spec"* (mismo
  pedido).
- `mocks/catalog.ts:68,80,91` — ver sección 3 (`basePrice`/`weightKg` de
  relleno).
- `lib/api.ts:14` — *"TODO: definir baseUrl (env var), manejo de auth (token
  Firebase), manejo de errores y los tipos `*Api` reales cuando cierre el
  contrato con el backend"* — es decir, el propio archivo de tipos se
  declara a sí mismo como provisional en su cabecera.
- Los ~25 `TODO: sustituir por mutation real (...)` repartidos en los hooks
  (`useOrders`, `useCatalog`, `useCategories`, `useClientTariffs`,
  `useRates`, `usePigYields`) son mecánicos y consistentes — no son
  hallazgos de negocio, son la lista de trabajo de integración (ver tabla de
  la sección 7).

### Hallazgo adicional no pedido explícitamente, pero relevante: restricción de rutas por rol

Ya cubierto en la sección 1: `lib/roles.ts` + `AuthGuard` implementan una
restricción de navegación por rol que contradice la decisión de negocio ya
confirmada y documentada del lado del backend (ADR-021: *"no hace falta
restringir accesos por rol"*). Se incluye acá porque es exactamente el tipo
de inconsistencia sin resolver que esta sección busca capturar, aunque no
esté marcada con un comentario `TODO` en el código — el código simplemente
implementa el criterio contrario sin señalarlo como abierto.

---

## 7. Patrón de datos mock → API real

### Mecanismo genérico

- **`lib/mockClient.ts`**: una única función, `mockRequest<T>(data, delayMs)`,
  que envuelve cualquier valor en una `Promise` con latencia simulada
  (300-500ms aleatorios). No hace red real, no lanza errores nunca (no hay
  ningún mock que rechace la promesa).
- **Store**: cada archivo de `mocks/` mantiene su propio array a nivel de
  módulo (`let` para los que mutan, `const` para los de solo lectura como
  `carriers.ts`). Las funciones `add*`/`update*`/`delete*` mutan el array in
  place y devuelven `mockRequest(array_completo)` — no hay optimistic
  update ni manejo de conflictos, cada mutación relee el estado completo.
- **Consumo**: cada hook llama a las funciones del mock dentro de un
  `useEffect`, con la variable `cancelled` de rigor para evitar
  `setState` sobre un componente desmontado — patrón repetido de forma
  idéntica en los 12 hooks de datos.

### Tabla de reemplazo

| Mock actual | Función(es) | Endpoint real esperado (según `contrato-api.md`) | Archivo(s) a modificar |
|---|---|---|---|
| `mocks/categories.ts` | `getMockCategories`, `addMockCategory`, `updateMockCategory`, `removeMockCategory` | `GET /categories`, `POST /categories` *(no existe en el contrato — sólo hay `PATCH`, ver nota)*, `PATCH /categories/:id`, `DELETE /categories/:id` *(no existe en el contrato)* | `hooks/useCategories.ts` |
| `mocks/catalog.ts` | `getMockCatalog`, `addMockProduct`, `updateMockProduct` | `GET /productes`, `POST /productes`, `PATCH /productes/:id` | `hooks/useCatalog.ts` |
| `mocks/rates.ts` | `getMockRates`, `getMockTariffColumns`, `updateMockPrices`, `addMockTariff` | `GET /tarifes/matriu`, `PATCH /tarifes/:tarifaId/preus/:producteId`; **`addMockTariff` no tiene equivalente** — `contrato-api.md` confirma que hoy no existe `POST /tarifes` | `hooks/useRates.ts` |
| `mocks/clientTariffs.ts` | `getMockClientTariffs`, `addMockClient`, `updateMockClient` | `GET /clients`, `POST /clients`, `PATCH /clients/:id` | `hooks/useClientTariffs.ts` |
| `mocks/carriers.ts` | `getMockCarriers` | `GET /transportistes` | `hooks/useCarriers.ts` |
| `mocks/orders.ts` | `getMockOrders`, `addMockOrder`, `updateMockOrder`, `nextMockOrderNumber` | `GET /comandes`, `POST /comandes`, `PATCH /comandes/:id`; `nextMockOrderNumber` **no tiene equivalente** — el backend genera `num` con un trigger, el frontend no debería seguir calculándolo | `hooks/useOrders.ts` (y de paso decidir si `useComandes.ts` se borra o se termina de implementar en su lugar) |
| `mocks/pigYields.ts` | `getMockPigYields`, `addMockPigYield`, `updateMockPigYield`, `deleteMockPigYield` | **Sin endpoint documentado** — `contrato-api.md` §7 dice explícitamente que este panel no se construye todavía | `hooks/usePigYields.ts` — requiere decisión de negocio antes que trabajo técnico |
| `mocks/pigConfig.ts` | `getMockPigConfig` | **Sin endpoint documentado**, mismo motivo que el anterior | `hooks/usePigConfig.ts` |
| `mocks/users.ts` | `getMockUsers`, `createMockUser`, `updateMockUser`, `deleteMockUser`, `validateCredentials` | **Sin endpoint REST** — gestión de usuarios/roles vía Firebase Admin SDK o consola, no vía `/api/v1`; `validateCredentials` se reemplaza por Firebase Auth directamente (ver sección 8), no por una llamada a este backend | `hooks/useUsers.ts`, `hooks/useAuth.tsx` — requiere decisión de diseño (sección 8), no un simple cambio de origen de datos |

**Sobre "categories": el contrato tiene una asimetría real.**
`contrato-api.md` sólo documenta `GET /categories` y `PATCH /categories/:id`
— no hay `POST` ni `DELETE` de categorías en la documentación del backend,
pero el frontend ya construyó las tres operaciones (`createCategory`,
`deleteCategory` incluidos). Esto es un gap de contrato a resolver con
Gerardo antes de integrar esa pantalla, no sólo un cambio de `fetch`.

**Ningún hook usa todavía `lib/api.ts` para nada real** — ese archivo hoy
sólo aporta los tipos; no tiene ninguna función `get`/`post`/`patch` como
sugieren los comentarios `TODO` (`api.get<...>(...)`). Cuando se integre,
hace falta construir esa capa de cliente HTTP desde cero (base URL, manejo
de token, manejo de errores con la forma `{ error: { codi, missatge,
detalls } }` del contrato) — hoy no existe ni un esqueleto.

---

## 8. Autenticación actual

**Mecanismo** (`hooks/useAuth.tsx` + `mocks/users.ts`):

1. **Login**: `validateCredentials(email, password)` busca en el array en
   memoria de `mocks/users.ts` un usuario cuyo `email` (case-insensitive)
   y `password` (comparación de **texto plano**) coincidan. Devuelve
   `{ ok: true, user }`, `{ ok: false, reason: "invalid" }` o
   `{ ok: false, reason: "inactive" }` (si `status !== "active"`).
2. **Persistencia de sesión**: si el login es exitoso, se guarda el **`id`
   del usuario** (no un token) en `window.localStorage`, bajo la clave
   `"dpages_session"`.
3. **Hidratación al recargar**: al montar `AuthProvider`, si hay un id en
   `localStorage`, se vuelve a pedir `getMockUsers()` completo y se busca el
   usuario por ese id — es decir, cada recarga de página vuelve a "traer" a
   todos los usuarios sólo para confirmar que uno de ellos sigue existiendo.
4. **Logout**: borra la clave de `localStorage` y limpia el estado.
5. **Credenciales de prueba** están documentadas en un comentario del propio
   mock (`mocks/users.ts:4-8`): `office@dpages.cat/office123`, etc.

**`lib/firebase.ts`** es un archivo vacío a propósito — sólo un comentario
(*"TODO: inicializar la app de Firebase [...] exponer el cliente de auth y
el helper para leer el rol del usuario desde el token"*) y un
`export {};` para que TypeScript no se queje del módulo vacío. No hay
ninguna dependencia de Firebase instalada todavía en
`packages/frontend/package.json`.

### Qué hay que reemplazar exactamente para conectar Firebase Auth real

Según lo documentado en CLAUDE.md/`docs/decisiones-arquitectura.md`
(ADR-021): Firebase Auth con JWT + rol como custom claim, sólo para
autenticación — ningún dato de negocio vive ahí.

1. **`lib/firebase.ts`**: inicializar `initializeApp(firebaseConfig)` y
   exportar el `Auth` de `getAuth(app)`. El `firebaseConfig` real ya existe
   (ver `docs/infraestructura-gcp-estado-16ago.md`, sección 2) — es la app
   web `dpages-frontend` ya registrada en el proyecto `dpages`.
2. **`login()` en `useAuth.tsx`**: reemplazar `validateCredentials(email,
   password)` por `signInWithEmailAndPassword(auth, email, password)`. El
   `UserApi` que hoy devuelve el mock (con `password` en texto plano) deja
   de tener sentido tal cual — el `role` ya no sale de una columna del
   store de usuarios, sale del **custom claim** del ID token
   (`getIdTokenResult(user).claims.role`).
3. **Hidratación de sesión**: reemplazar la lectura de `localStorage` +
   `getMockUsers().find(...)` por `onAuthStateChanged(auth, callback)` —
   Firebase mantiene la sesión sola (por defecto en `localStorage`
   internamente, pero gestionado por el SDK, no a mano). El `id` guardado
   hoy en `"dpages_session"` deja de ser necesario.
4. **`logout()`**: reemplazar `localStorage.removeItem(...)` por
   `signOut(auth)`.
5. **`UserApi.password`**: eliminar el campo por completo — no debe existir
   ni siquiera en el tipo, mucho menos viajar por la red en texto plano.
6. **Envío del token a cada petición**: hoy no existe ningún cliente HTTP
   real (ver sección 7) — cuando se construya, cada llamada a `/api/v1/*`
   necesita el header `Authorization: Bearer <Firebase ID token>`
   (`user.getIdToken()`), tal como exige `contrato-api.md` sección 2.
7. **La pantalla `/users` completa** (alta/baja/edición de usuarios) queda
   sin mecanismo de backend directo — ver hallazgo crítico de la sección 3:
   la gestión de usuarios de Firebase normalmente no se hace desde una API
   REST pública del propio backend de negocio. Es una decisión de diseño
   pendiente (¿se gestiona desde la consola de Firebase? ¿se construye un
   endpoint administrativo aparte, protegido, que use el Admin SDK?), no
   sólo un cambio de implementación del hook.

---

## 9. Componentes UI con lógica de datos embebida

### Riesgo alto: formateo de fechas asume `"YYYY-MM-DD"`, el contrato manda ISO-8601 con hora

`lib/orderCalculations.ts`, función `formatDateDisplay`:
```ts
export function formatDateDisplay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
```
Y en `app/office/page.tsx`, `formatDateShort` hace lo mismo de forma
independiente (código duplicado, no reutiliza `orderCalculations.ts`):
```ts
function formatDateShort(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}
```
Ambas funciones asumen una fecha **sin hora** (`"2026-08-17"`). El contrato
del backend (`contrato-api.md`, sección 2, tabla de formatos) manda fecha y
hora como **`"2026-08-15T09:30:00Z"`**. Aplicar `.split("-")` a ese string
da `["2026", "08", "15T09:30:00Z"]` — el "día" mostrado sería literalmente
`"15T09:30:00Z"`. **Esto rompe en cuanto se conecta el backend real**, en
las ~10 pantallas que usan estas dos funciones (`orders`, `office`,
`office/[number]`, `workshop`, `packaging`). Hace falta normalizar a un
único punto de parseo de fecha (el propio contrato lo sugiere: *"la
conversión a hora local de Cataluña se hace en el frontend, en un único
punto"* — hoy hay al menos dos puntos, no uno).

### Riesgo medio: números vs. strings en todo cálculo con decimales

Cada pantalla que muestra kg o precio hace `value.toFixed(3).replace(".",
",")` o `.toFixed(2)` directamente sobre lo que hoy es un `number` del mock.
El contrato manda estos valores como **string** (`"1.250"`, `"9.86"`) para
no perder precisión. No hay ninguna utilidad compartida de parseo/formateo
de decimales en `lib/` — cada componente asume que el valor ya es un
`number` de JS. Archivos con esta suposición repetida: `catalog/page.tsx`,
`rates/page.tsx` (vía `EditableCell`), `office/page.tsx`,
`office/[number]/page.tsx`, `orders/OrderForm.tsx`, `workshop/page.tsx`,
`packaging/page.tsx`, `pig-yields/page.tsx`, `production/page.tsx`.

### Riesgo medio: `weightKg <= 0` como sentinela de "sin peso definido"

`calculateOrderedWeightKg` (`lib/orderCalculations.ts`) trata
`product.weightKg <= 0` como "artículo a medida, peso no calculable". El
backend usa `pesKg === null` para el mismo concepto (`ProducteApi.pesKg:
string | null`). Son sentinelas distintos: hoy, `ProductForm.tsx` inicializa
`weightKg` en `0` para un producto nuevo (`initialData?.weightKg ?? 0`), lo
cual **ya dispara el camino "a medida" del cálculo incluso para un producto
al que simplemente no se le cargó peso todavía** — mismo comportamiento
funcional que el backend, pero por una razón distinta (cero vs. null). Al
integrar, hay que decidir si el `0` se sigue usando como valor por defecto
del formulario (y se traduce a `null` al enviar) o si el formulario empieza
a manejar `null` de forma explícita.

### Riesgo bajo: joins con `.find()` y fallback a texto crudo

`OrderForm.tsx`, todas las páginas con tablas (`orders`, `office`,
`workshop`, `packaging`, `rates`, `client-tariffs`) resuelven relaciones con
`array.find(item => item.code === codigo) ?? valorCrudo`. Es un patrón
defensivo razonable (no revienta si falta el dato), pero **asume que todo
listado relacionado ya está cargado en memoria completo** al momento de
renderizar — no hay paginación de referencias ni carga bajo demanda. Contra
un backend real con miles de clientes (`contrato-api.md` ejemplo: `"total":
1222` en `GET /clients`), cargar el array completo de clientes en cada
pantalla que hoy hace `useClientTariffs()` sin paginar puede ser un problema
de rendimiento a vigilar, no sólo un detalle de tipos.

---

## 10. Estado de tests/verificación

**No hay ningún test automatizado en el frontend.** Confirmado
explícitamente, no por omisión:

- `packages/frontend/package.json` no tiene script `test`, ni tiene
  `vitest`, `jest`, `@testing-library/*` ni `@playwright/test` entre sus
  dependencias (`dependencies`/`devDependencies` completos revisados).
- Búsqueda de archivos `*.test.*` y `*.spec.*` en todo `packages/frontend`:
  **cero resultados**.
- No hay `playwright.config.*`, `vitest.config.*` ni `jest.config.*` en el
  paquete.

Cualquier verificación con Playwright que se haya hecho durante el
desarrollo (mencionada en el pedido de este documento) fue **manual/
interactiva contra el servidor de desarrollo**, no quedó como suite
versionada en el repositorio — no deja ningún artefacto sobre el que este
documento pueda reportar cobertura, y no ofrece ninguna protección contra
regresiones a partir de hoy. Para quien planifique la integración: cualquier
cambio de contrato (los 4 puntos calientes de la sección 5, los tipos de la
sección 3) hoy **sólo se puede verificar a mano, pantalla por pantalla**.
