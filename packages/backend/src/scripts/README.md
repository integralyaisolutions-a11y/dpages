# Scripts

## Disparo manual (no diagnóstico — parte real del flujo, sin HTTP todavía)

- **`ingerir.ts`** — dispara la ingesta (`src/sync/ingesta.ts`) a mano:
  `npm run ingerir -- comandes|cataleg|tots`. Existe porque el endpoint de
  tareas (`/tasques/sync-*`, ADR-009) todavía no existe — es de la capa de
  servidor HTTP. Cuando esa capa llegue, el endpoint llama a las mismas
  funciones (`ingerirComandes`/`ingerirCataleg`), no reemplaza este script.
- **`transformar.ts`** — dispara la transformación (`src/transform/`) a
  mano: `npm run transformar -- cataleg|comandes|tots`. Corre DESPUÉS de la
  ingesta, nunca antes: transforma lo que ya está aterrizado crudo en
  `aterratge_woocommerce`. El catálogo va primero si se corre "tots" — las
  líneas de pedido resuelven artículo contra `alias_producte`.

## Diagnóstico, de un solo uso

No son parte del servicio, no se despliegan a Cloud Run. Sin script de
`package.json` — se invocan directo con `tsx`.

- **`netejar-historic-desenvolupament.ts`** — borra de la base de
  DESARROLLO local los pedidos anteriores a una fecha de corte (por
  defecto 2026-08-01), y su crudo/incidencias/líneas asociadas. Se escribió
  para descartar el histórico completo de WooCommerce (4.250 pedidos) que
  se trajo puntualmente para diagnosticar bugs, una vez que ya cumplió su
  propósito. Rechaza correr con `NODE_ENV=production`. No borra `producte`,
  `categoria_producte`, `client` ni `transportista` — sólo reporta cuántos
  `client` quedarían sin ningún pedido posterior a la fecha de corte, sin
  borrarlos.

  ```
  tsx --env-file-if-exists=../../.env src/scripts/netejar-historic-desenvolupament.ts [fecha ISO]
  ```

- **`seed-arranque.ts`** — carga (UPSERT, correrlo de nuevo no duplica)
  las 8 categorías y los 2 orígenes de pedido de arranque, autorizados por
  el cliente (Francesc) el 18/08/2026 para no esperar los datos reales
  hasta el cut-over. A diferencia de `netejar-historic-desenvolupament.ts`,
  **no** rechaza correr en producción — se piensa usar también contra
  Cloud SQL real.

  ```
  tsx --env-file-if-exists=../../.env src/scripts/seed-arranque.ts
  ```

## Carga inicial desde Excel (`carga-inicial/`)

Capa 18. Precarga de datos maestros desde .xlsx, según el modelo acordado
con el cliente (docs/especificacion-funcional-dpages-v2.md sección 6: _"el
cliente entrega Excel, el equipo hace la precarga"_). **Hoy es SIMULADA**:
los tres `entrada/*.xlsx` son datos de ejemplo generados por
`generar-dades-exemple.ts`, no el Excel real del cliente (todavía no
llegó, sin calendario de cut-over definido). El mecanismo — lectura,
validación, upsert — es el mismo que se va a usar con los datos reales;
sólo cambia el contenido del .xlsx.

No cubre **categorías** ni **rendimientos de cerdos**: esos ya tienen datos
cargados desde `seed-arranque.ts` (capa 13, autorizados por el cliente) y
son de naturaleza distinta — vienen del prototipo, no de una carga masiva.
Tampoco cubre **transportistas** (fuera del alcance de esta capa).

**ORDEN DE EJECUCIÓN OBLIGATORIO:**

1. `importar-articles.ts` — primero siempre. Nada más depende de él, pero
   él no depende de nada.
2. `importar-tarifes.ts` — después de artículos. Su hoja "Preus" valida
   `articleCodi` contra el catálogo ya importado en el paso 1.
3. `importar-clients.ts` — en cualquier momento después de tarifas. Valida
   `tarifaCodi` (si viene informado) contra las tarifas del paso 2.

Los tres siguen el mismo patrón: leen un .xlsx de `entrada/`, **validan
TODAS las filas antes de escribir nada** (un solo error reportado = nada
se escribe — nunca una importación parcial silenciosa), y hacen UPSERT por
`codi` (correrlos de nuevo no duplica, actualiza). Al terminar, imprimen un
resumen de creados/actualizados/salteados. La lógica de validación de cada
uno es una función pura exportada (`validarArticles`/`validarTarifes`/
`validarClients`), testeada con fixtures en memoria — no hace falta un
.xlsx real para correr los tests.

- **`generar-dades-exemple.ts`** — genera los tres `entrada/*.xlsx` de
  ejemplo desde cero (datos de mentira, forma correcta). Se puede volver a
  correr en cualquier momento para regenerarlos.

  ```
  tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/generar-dades-exemple.ts
  ```

- **`importar-articles.ts`** — lee `entrada/articles-exemple.xlsx`
  (columnas: `codi`, `descripcio`, `categoria`, `agrupacioProduccio`,
  `format`, `envasat`, `pesKg`, `preuVenda`). Valida que `categoria` exista
  en `categoria_producte` y que `format`/`envasat` sean valores válidos del
  enum. `pesKg` vacío es válido (artículo "a medida").

  ```
  tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/importar-articles.ts
  ```

- **`importar-tarifes.ts`** — lee `entrada/tarifes-exemple.xlsx`, dos
  hojas: "Tarifes" (`codi`, `nom`) y "Preus" (`tarifaCodi`, `articleCodi`,
  `preu` — matriz dispersa, no hace falta que todos los artículos tengan
  precio en todas las tarifas). Valida `tarifaCodi` contra la propia hoja
  "Tarifes" del archivo, y `articleCodi` contra el catálogo ya importado.

  ```
  tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/importar-tarifes.ts
  ```

- **`importar-clients.ts`** — lee `entrada/clients-exemple.xlsx`
  (columnas: `codi`, `nom`, `poblacio`, `tarifaCodi` opcional). Valida que
  `tarifaCodi`, si viene informado, ya exista. UPSERT por `ON CONFLICT
(codi)`, igual que los otros dos — usa `idx_client_codi` (migración
  0015; antes de esa migración `client.codi` no tenía ningún índice único
  y este script resolvía el upsert a mano con un SELECT-then-INSERT/UPDATE
  no atómico).

  ```
  tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/importar-clients.ts
  ```

- **`reset-carga-inicial.ts`** — vuelve a estado limpio lo que estos tres
  importadores pudieron haber creado (`producte`, `tarifa`, `tarifa_preu`,
  `client`). Pensado para correr antes del cut-over real, una vez que la
  simulación con datos de ejemplo ya cumplió su propósito. **Destructivo**
  — pide escribir `CONFIRMAR` antes de borrar nada. Protege automáticamente
  cualquier `tarifa`/`producte`/`client` que ya tenga un pedido real
  apuntándole (`comanda`/`comanda_linia`), y avisa cuáles quedaron y por
  qué. A diferencia de `netejar-historic-desenvolupament.ts`, **si** puede
  correr contra producción, con el flag `--permitir-produccio` — la idea es
  usarlo contra Cloud SQL real para limpiar los datos de PRUEBA de esta
  simulación antes del cut-over de verdad.

  ```
  tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/reset-carga-inicial.ts [--permitir-produccio]
  ```

Previstas, todavía sin escribir:

- **Perfilado de la tienda WooCommerce** — reutilizando
  `src/woocommerce/cliente.ts`. Se necesita de nuevo cuando el cliente
  entregue la tabla maestra de artículos (para cruzarla contra lo que hay
  hoy en WooCommerce).
- Importador de **transportistas** desde Excel — mismo patrón que
  `carga-inicial/`, todavía no pedido.
