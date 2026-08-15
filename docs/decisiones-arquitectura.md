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
coincide, por `(producto, ordinal)`. Las líneas que ya no vienen de
WooCommerce se marcan `esborrada = true`, nunca se eliminan físicamente.

**Consecuencias**: Se preserva el trabajo de empaquetado incluso cuando
WooCommerce cambia los ids de línea por detrás. El esquema necesita una
columna de borrado lógico y toda consulta de líneas "activas" tiene que
filtrar por ella.

---

## ADR-007 — Regla de congelación al entrar en producción

**Estado**: Aceptado.

**Contexto**: Un cliente editando su pedido en la web no puede alterar en
silencio una orden de trabajo que el obrador ya está ejecutando.

**Decisión**: Una vez que un pedido entra en producción (`congelada =
true`), el sync deja de sobrescribirlo. Si llega una actualización de
WooCommerce para un pedido congelado, se registra como **incidencia** para
que oficina la resuelva manualmente, en vez de aplicarse.

**Consecuencias**: Requiere que todo el código de sync chequee el flag
`congelada` antes de aplicar un upsert de cabecera o de líneas, y que exista
un mecanismo de incidencias visible para oficina.

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
(`build`, `dev`, `typecheck`, `test` corren `build:shared` primero). Cambiar
un tipo en `shared` no se refleja en los otros paquetes hasta recompilar.
