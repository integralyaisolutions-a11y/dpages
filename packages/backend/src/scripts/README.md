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

Previstas, todavía sin escribir:

- **Perfilado de la tienda WooCommerce** — reutilizando
  `src/woocommerce/cliente.ts`. Se necesita de nuevo cuando el cliente
  entregue la tabla maestra de artículos (para cruzarla contra lo que hay
  hoy en WooCommerce).
- Cargas puntuales (por ejemplo, la importación inicial de pesos por
  artículo).
