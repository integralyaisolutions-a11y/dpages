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

No son parte del servicio, no se despliegan a Cloud Run.

Previstas, todavía sin escribir:

- **Perfilado de la tienda WooCommerce** — reutilizando
  `src/woocommerce/cliente.ts`. Se necesita de nuevo cuando el cliente
  entregue la tabla maestra de artículos (para cruzarla contra lo que hay
  hoy en WooCommerce).
- Cargas puntuales (por ejemplo, la importación inicial de pesos por
  artículo).
