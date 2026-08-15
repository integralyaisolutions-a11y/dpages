# Decisiones de arquitectura (ADRs)

Formato: Contexto, Decisión, Consecuencias. Una decisión por sección. Si un
cambio de código contradice un ADR vigente, el commit tiene que actualizar el
ADR (marcarlo `Superseded` y explicar por qué), nunca ignorarlo en silencio.

---

## ADR-001 — Usar la API REST v3 moderna de WooCommerce, no la legacy

**Estado**: Aceptado.

**Contexto**: WooCommerce expone dos APIs distintas: la legacy
(`/wc-api/v3/`) y la moderna basada en WP REST (`/wp-json/wc/v3/`). Hay
documentación y ejemplos circulando que referencian la legacy, con nombres de
campo distintos (`title` vs `name`, `created_at` vs `date_created`).

**Decisión**: Usar exclusivamente `/wp-json/wc/v3/`.

**Consecuencias**: Cualquier código, documentación o ejemplo que use los
nombres de campo de la legacy es un bug, no una variante válida.

---

## ADR-002 — Sincronización híbrida: webhook + polling incremental + reconciliación

**Estado**: Aceptado.

**Contexto**: WooCommerce es uno de cuatro canales de entrada, no la fuente
de verdad. Necesitamos que los pedidos web aparezcan rápido en el sistema,
pero sin depender únicamente de webhooks (pueden perderse, llegar
duplicados o fuera de orden) ni únicamente de polling (latencia).

**Decisión**: Sync híbrido.

- El **webhook es una notificación**, no la fuente del dato: al recibirlo se
  extrae el id del pedido y se hace `GET /orders/{id}` para traer el estado
  canónico. Elimina el problema de payloads incompletos o fuera de orden.
- **Polling incremental**: cada 5 minutos para pedidos, 2 veces al día para
  catálogo, usando `modified_after`/cursor (ver ADR obligatorias de consulta
  en `docs/hallazgos-woocommerce.md`).
- **Reconciliación diaria** con ventana amplia de 7 días, para corregir
  cualquier cosa que se haya perdido por webhooks caídos o fallos de red.
- Disparo de todo esto: ver ADR-009 (no hay cron en proceso).

**Consecuencias**: Ningún componente confía en una sola fuente de
sincronización. El sistema tolera caída temporal de webhooks o de un ciclo
de polling sin perder datos, a costa de más complejidad que un enfoque
único.

---

## ADR-003 — Tabla de aterrizaje cruda (jsonb) antes de normalizar

**Estado**: Aceptado.

**Contexto**: Normalizar directamente al recibir cada respuesta de
WooCommerce acopla la ingesta a la transformación: un bug en la
transformación obliga a volver a pegarle a la API del cliente para
reprocesar, y la API tiene latencia (~3s por consulta).

**Decisión**: Guardar el JSON completo de cada recurso (`orders`,
`products`, `products/{id}/variations`) en una tabla `jsonb` de aterrizaje
antes de transformar/normalizar.

**Consecuencias**: Se puede reprocesar la transformación completa sin volver
a consultar WooCommerce. Desacopla ingesta de normalización — se pueden
arreglar bugs de transformación y correrlos sobre datos ya aterrizados.
Costo: espacio en disco adicional y una capa más de indirección.

---

## ADR-004 — Upsert de cabecera de pedido con guardián de versión

**Estado**: Aceptado.

**Contexto**: Con sync híbrido (ADR-002), un webhook puede llegar después de
que un ciclo de polling ya haya traído una versión más nueva del mismo
pedido (o viceversa). Sin control de versión, el que llega último gana,
aunque sea el dato más viejo.

**Decisión**: Al actualizar una cabecera de pedido, aplicar el UPDATE
**sólo si** el `date_modified_gmt` entrante es mayor que el almacenado. La
comparación va en el propio `WHERE` del UPDATE (atómica), no en un SELECT
previo separado.

**Consecuencias**: Un webhook retrasado nunca puede pisar datos más nuevos.
Requiere que toda ruta de escritura de cabecera de pedido pase por esta
misma consulta guardada — no puede haber un UPDATE alternativo que la
esquive.

---

## ADR-005 — Propiedad de columnas: WooCommerce vs. sistema

**Estado**: Aceptado.

**Contexto**: El sistema no es un espejo de WooCommerce: agrega datos
propios (fechas de producción/expedición/entrega, transportista, tarifa,
confirmaciones de empaquetado) sobre datos que sí vienen de WooCommerce. Sin
una regla clara, el sync corre el riesgo de sobrescribir trabajo operativo
ya hecho.

**Decisión**: Cada columna tiene un único dueño.

- **De WooCommerce** (el sync puede sobrescribir): estado web, población
  destino, total, unidades pedidas, precio unitario.
- **Del sistema** (el sync nunca las toca): fechas de producción /
  expedición / entrega, transportista, tarifa, bultos, estado operativo,
  observaciones, unidades y kilos entregados, confirmación.

**Consecuencias**: Ningún UPDATE de sincronización puede tocar columnas de
la segunda categoría, ni siquiera accidentalmente por usar `UPDATE ... SET *`
o un ORM genérico (motivo adicional para no usar ORM). Ver también ADR-007
(congelación).

---

## ADR-006 — Líneas de pedido: nunca DELETE+INSERT

**Estado**: Aceptado.

**Contexto**: Los `line_item.id` de WooCommerce no son estables: al editar
un pedido desde el admin de WooCommerce, los ítems se recrean con ids
nuevos. Un DELETE+INSERT en cada sync borraría también los kilos y unidades
que empaquetado ya registró para esas líneas.

**Decisión**: Emparejar líneas primero por `woo_line_item_id`; si no
coincide, por `(producte_id, ordinal)`. Las líneas que ya no vienen de
WooCommerce se marcan `esborrat = true` (columna en `comanda_linia`), nunca
se eliminan físicamente.

**Consecuencias**: Se preserva el trabajo de empaquetado incluso cuando
WooCommerce cambia los ids de línea por detrás. El esquema necesita una
columna de borrado lógico y toda consulta de líneas "activas" tiene que
filtrar por ella.

---

## ADR-007 — Regla de congelación al entrar en producción

**Estado**: Aceptado.

**Contexto**: Un cliente editando su pedido en la web no puede alterar en
silencio una orden de trabajo que el obrador ya está ejecutando.

**Decisión**: Una vez que un pedido entra en producción, se graba
`congelat_a` (columna `TIMESTAMPTZ` en `comanda`, no nula desde ese
momento) y el sync deja de sobrescribirlo. Si llega una actualización de
WooCommerce para un pedido congelado, se registra como **incidencia** para
que oficina la resuelva manualmente, en vez de aplicarse.

**Consecuencias**: Requiere que todo el código de sync chequee
`congelat_a IS NULL` antes de aplicar un upsert de cabecera o de líneas, y
que exista un mecanismo de incidencias visible para oficina.

---

## ADR-008 — Catálogo con tabla de alias por idioma

**Estado**: Aceptado.

**Contexto**: Ver hallazgo verificado en `docs/hallazgos-woocommerce.md`: el
catálogo está duplicado por idioma (Polylang), con el mismo SKU en dos
`product_id` distintos, y ambas versiones reciben pedidos activamente. Un
mapeo `woo_product_id → artículo` no puede funcionar porque no hay un único
`product_id` "correcto" por artículo.

**Decisión**: Tabla `alias_producte` que vincula cada `woo_product_id` (con
su idioma) al artículo canónico (`producte`). La resolución de una línea de
pedido busca primero por alias existente; si no lo encuentra, cae a
resolución por SKU.

**Consecuencias**: El artículo canónico (peso, nombre para el sistema,
categoría) vive independiente de WooCommerce. Ingesta y transformación
tienen que resolver siempre vía esta tabla, nunca asumiendo relación directa.

---

## ADR-009 — Disparo de sincronización vía endpoint de tareas + Cloud Scheduler

**Estado**: Aceptado.

**Contexto**: Cloud Run no soporta procesos de larga duración ni cron en
proceso — cada instancia puede vivir minutos y escalar a cero. La
sincronización cada 5 minutos (ADR-002) necesita un disparador externo.

**Decisión**: Cloud Scheduler llama a endpoints HTTP dedicados:

- `POST /tasques/sync-comandes`
- `POST /tasques/sync-cataleg`
- `POST /tasques/reconciliar`

Protegidos: en producción validan el token OIDC que envía Cloud Scheduler;
en local, un secreto compartido por variable de entorno. Responden rápido y
son idempotentes — un reintento de Scheduler (por timeout o error 5xx) no
puede duplicar trabajo.

**Consecuencias**: Nada de `setInterval`/`node-cron` en el proceso del
backend (ver también el agente `cloud-run-optimizer`). El aprovisionamiento
de Cloud Scheduler es parte de `infra/gcp/`. La implementación de estas
rutas llega en la capa "servidor HTTP"; documentadas también en
`docs/contrato-api.md`.

---

## ADR-010 — `@dpages/shared` se consume como paquete compilado

**Estado**: Aceptado.

**Contexto**: Es la fricción clásica de los monorepos: `shared` se puede
consumir como código fuente (vía `paths` de TypeScript) o como paquete
compilado (`dist/` + `exports` en `package.json`). Next.js consume paquetes
compilados sin configuración adicional; con `paths` de TypeScript, el
frontend se topa con errores de transpilación difíciles de diagnosticar
(Next no siempre transpila código fuente de fuera de su propio árbol sin
configuración extra).

**Decisión**: `packages/shared` se compila a `dist/` con `main`, `types` y
`exports` declarados en su `package.json`. Backend y frontend lo consumen
como paquete de node_modules (symlink de npm workspaces), nunca importando
`../shared/src/...` directamente.

**Consecuencias**: El build de `shared` tiene que correr antes que el de
`backend` (y antes de levantar el dev server de `frontend`), tanto en local
como en CI — resuelto explícitamente en los scripts de la raíz
(`build`, `dev`, `typecheck`, `test` corren `build:shared` primero, y
`postinstall` lo compila automáticamente después de todo `npm install`/
`npm ci`, para que clonar el repo y arrancar no dependa de que alguien sepa
este detalle). Cambiar un tipo en `shared` no se refleja en los otros
paquetes hasta recompilar — no hay watch automático entre paquetes.

---

## ADR-011 — Runner de migraciones propio: transacción por archivo y verificación por hash

**Estado**: Aceptado.

**Contexto**: Las migraciones son SQL plano numerado (`NNNN_nombre.up.sql` /
`.down.sql`, ver el agente `db-schema`). Hacía falta decidir cómo se
aplican: todo el lote en una sola transacción o una por archivo, y cómo
detectar el error más difícil de este esquema — que alguien edite una
migración que otra persona ya aplicó, en vez de agregar una nueva.

**Decisión**:

- Una tabla `esquema_migraciones` (nombre genérico, no catalán: es
  infraestructura de la herramienta, no una entidad del dominio del
  cliente) registra `id`, `nombre_archivo`, `checksum` (SHA-256 del
  contenido) y `aplicada_en`.
- **Cada migración se aplica en su propia transacción** (`BEGIN`/`COMMIT`
  por archivo, no una transacción para todo el lote). Si la 0003 falla, la
  0001 y la 0002 quedan aplicadas y registradas — no hay que reintentar
  desde cero.
- **Antes de aplicar nada**, el runner compara el checksum de cada
  migración ya aplicada contra el contenido actual del archivo en disco. Si
  no coincide, corta con un error explícito y no aplica ninguna migración
  pendiente hasta que se resuelva.
- Correr el runner sin migraciones pendientes es un no-op: es lo que lo hace
  seguro de correr las veces que haga falta (en CI, a mano, o como paso de
  despliegue — nunca automáticamente al arrancar el servicio, ver ADR-012).
- El runner vive en `packages/backend/src/db/migrate.ts`, expone `up` y
  `status` por ahora (no `down` automatizado — los `.down.sql` existen para
  reversión manual en desarrollo, nunca para producción, ver el agente
  `db-schema`).

**Consecuencias**: Ver un fallo a mitad de un lote no obliga a averiguar qué
quedó a medias — el estado en `esquema_migraciones` es la fuente de verdad.
El chequeo de hash convierte "alguien editó una migración vieja" en un error
ruidoso al arrancar en vez de un esquema desincronizado que se descubre
semanas después. Costo: si de verdad hace falta corregir una migración ya
aplicada (typo, etc.), no se edita — se agrega una migración nueva que
corrige, igual que con cualquier cambio de esquema posterior.

---

## ADR-012 — Las migraciones se aplican como paso separado, nunca al arrancar el servicio

**Estado**: Aceptado.

**Contexto**: Cloud Run puede levantar varias instancias del backend a la
vez (arranque en frío, escalado, un deploy nuevo mientras la revisión vieja
todavía atiende tráfico). Si el runner de migraciones corriera dentro de
`src/index.ts` al arrancar, N instancias podrían competir por aplicar el
mismo esquema al mismo tiempo. El guardián de checksum e `INSERT` con clave
primaria de `esquema_migraciones` (ADR-011) evitarían una corrupción real,
pero el resultado seguiría siendo frágil: una instancia aplicando DDL
mientras otra ya sirve tráfico con el esquema viejo, y una migración que
falla tirando abajo el arranque de TODAS las instancias nuevas en vez de
sólo bloquear el paso de despliegue que la necesita.

**Decisión**: El runner de migraciones nunca se invoca desde el código de
arranque del servidor HTTP. Se ejecuta como un paso separado y explícito
(`node dist/db/migrate.js up`), antes de desplegar la revisión nueva. En
Cloud Run esto se traduce en un Job aparte (o una ejecución manual) que
corre y termina, no en el propio servicio. Por eso la imagen de Docker
incluye `migrations/` y el runner ya compilado — el comando alternativo
está disponible en la misma imagen que se despliega, sin necesitar una
imagen distinta para migrar.

**Consecuencias**: Desplegar pasa a ser dos pasos (migrar, después
desplegar la revisión) en vez de uno, y todavía no está automatizado — el
Job de Cloud Scheduler/Run para esto es trabajo de `infra/gcp/`, pendiente.
A cambio, un fallo de migración nunca puede tirar abajo el servicio: se
detecta y se resuelve ANTES de que una instancia nueva intente arrancar con
un esquema a medio aplicar.

---

## ADR-013 — Carga de `.env` vía `--env-file-if-exists`, nunca en código de aplicación

**Estado**: Aceptado.

**Contexto**: `env.ts` siempre leyó `process.env` directamente (a propósito:
es lo correcto para Cloud Run, donde las variables las inyecta la
plataforma y Secret Manager). El problema es que **nada** cargaba el
`.env` local hacia `process.env` antes de que `env.ts` lo leyera — no había
`dotenv` instalado ni ningún flag de Node en los scripts. Resultado real:
copiar `.env.example` a `.env` y completarlo no alcanzaba, porque nadie lo
leía. Además, los scripts de npm corren con cwd en el paquete
(`packages/backend`), no en la raíz del monorepo donde vive `.env` — una
carga que asuma cwd se rompe apenas alguien invoca el script desde otro
lado.

**Decisión**: Cargar `.env` con el flag nativo de Node
`--env-file-if-exists=../../.env`, agregado en los scripts de
`packages/backend/package.json` que lo necesitan (`dev`, `start`,
`migrate`, `migrate:status`) — **no** en `env.ts` ni en ningún otro código
de aplicación. La ruta es relativa a la raíz del monorepo, fija, sin
depender de desde dónde se invoque `npm run`.

Se eligió `--env-file-if-exists` (silencioso si el archivo no existe) en
vez de `--env-file` (que aborta con un error de Node si falta el archivo):
así, si falta `.env`, quien lo ve es el mensaje de `env.ts` ("falta esta
variable de entorno... revisá `.env.example`") — el mismo mensaje claro
tanto si falta el archivo entero como si falta una sola variable dentro de
uno que sí existe. Un solo camino de error, no dos.

No se agregó `dotenv` ni ninguna dependencia nueva: Node 20.6+/22 lo trae
nativo.

**Consecuencias**:

- **Producción nunca carga nada**: el `CMD` del `Dockerfile` es
  `node dist/index.js`, directo, sin pasar por los scripts de npm — nunca
  lleva el flag, así que en Cloud Run jamás se intenta leer un archivo
  `.env` (que además ni siquiera viaja en la imagen). No hizo falta
  ninguna rama `if (NODE_ENV === 'production')` en el código para lograr
  esto: la garantía es estructural, no una condición que alguien podría
  romper.
- **Los tests no dependen de ningún `.env`**: `vitest.config.ts` ya seteaba
  sus propias variables dummy vía `test.env` (nunca leyó archivos) — esto
  no cambió, y sigue significando que CI y una máquina local se comportan
  igual sin importar qué `.env` tenga cada quien.
- Quien clone el repo tiene que copiar `.env.example` a `.env` en la raíz
  antes de correr `dev`/`migrate` — documentado en el README.

---

## ADR-014 — `aterratge_woocommerce` guarda el último payload, no un historial de versiones

**Estado**: Aceptado.

**Contexto**: `aterratge_woocommerce` tiene `PRIMARY KEY (recurs, woo_id)` y
la ingesta hace `ON CONFLICT (recurs, woo_id) DO UPDATE` (capa 5) — cada
ingesta pisa el payload anterior del mismo recurso. Esto se decidió al
implementar la capa 5, razonando que el propósito declarado en ADR-003 es
"reprocesar la transformación sin volver a pegarle a la API" — para eso
alcanza con el último estado crudo, no hace falta un historial. **Pero esa
consecuencia (se pierde la posibilidad de ver cómo evolucionó un pedido en
WooCommerce a lo largo del tiempo) no se puso a consideración explícita ni
quedó escrita en ningún ADR** — fue una decisión tomada al codificar, no
una decisión conjunta documentada. Correcto marcarla ahora como lo que es.

**Decisión**: Se mantiene el comportamiento actual (upsert, sin historial)
por estos motivos, ahora sí explícitos:

- El propósito de la tabla de aterrizaje es desacoplar ingesta de
  transformación (ADR-003), no auditoría. Para reprocesar el estado
  _actual_, el histórico no aporta nada.
- El historial de negocio que sí importa — cómo cambió un pedido real, con
  fecha — vive en `comanda`/`comanda_linia` (con `creat_en`,
  `data_modificacio_woo`) una vez transformado, que es donde oficina y
  producción lo necesitan consultar.
- Guardar cada versión cruda que llega (pedidos se pueden modificar varias
  veces) crece sin cota y sin un caso de uso concreto hoy que lo pida.

**Consecuencias**: Si en el futuro aparece una necesidad real de auditoría
del payload crudo tal como lo mandó WooCommerce en cada momento (no sólo el
estado transformado), esto se revisita — la migración sería agregar un `id`
autoincremental y sacar el upsert (pasar a log append-only), o una tabla de
auditoría aparte. No es un cambio grande, pero tampoco se construye ahora
sin un motivo concreto que lo pida.

---

## ADR-015 — Node 24 como versión única del proyecto (LTS activa, no la más nueva por comodidad)

**Estado**: Aceptado.

**Contexto**: El proyecto arrancó fijando Node 22 en todos lados (`.nvmrc`,
`engines`, `Dockerfile`, CI). A los dos días de vida, con cero dependencias
que pudieran romperse por el cambio, se revisó esa elección contra el
calendario real de releases de Node.js:

| Versión | Fase actual (agosto 2026)              | Pasa a Mantenimiento | Fin de vida (EOL) |
| ------- | -------------------------------------- | -------------------- | ----------------- |
| Node 22 | LTS de Mantenimiento (desde oct. 2025) | ya pasó              | **abril de 2027** |
| Node 24 | LTS Activa (desde oct. 2025)           | octubre de 2026      | **abril de 2028** |

Node 22 ya está en la fase donde sólo recibe parches de seguridad críticos,
no mejoras — y muere un año antes que Node 24. Seguir con Node 22 significa
heredar una migración de versión mayor en algún punto de 2026-2027, ya con
el sistema en producción (puesta en marcha objetivo: septiembre de 2026) y
con dependencias reales acumuladas. Este es el momento más barato posible
para este cambio: dos días de código, sin nada que validar contra una
versión vieja.

**Decisión**: Node 24 es la versión única del proyecto, en todos los
lugares donde antes decía 22: `.nvmrc`, `engines` de los cuatro
`package.json` (raíz y los tres paquetes), las tres etapas del `Dockerfile`,
`node-version` en `ci.yml`, y `@types/node` fijado explícitamente en la
línea `24.x` (antes llegaba de arrastre transitivo vía `@types/pg`/`vitest`
en la `26.x` — desalineado con la versión real del runtime, sin que nadie
lo hubiera decidido).

No es "la versión más nueva porque sí": es la LTS **activa** — la que
recibe mejoras y parches por igual, no sólo parches de seguridad — con el
mayor tiempo de vida útil por delante para un proyecto que recién empieza.

**Consecuencias**: Ninguna dependencia del proyecto quedó atada a Node 22
(cero código heredado), así que el cambio fue mecánico. Revisar esta
decisión de nuevo cuando Node 24 pase a Mantenimiento (**octubre de
2026**) — para entonces evaluar si conviene saltar a la siguiente LTS activa
(Node 26, prevista) antes de que dPagès esté en producción, o esperar a
después del go-live. No adoptar Node 25/27/... (versiones impares, "Current"
sin garantía de LTS) en ningún entorno: son de vida corta y no están
pensadas para producción.
