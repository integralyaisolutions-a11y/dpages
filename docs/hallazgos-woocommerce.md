# Hallazgos verificados — WooCommerce (dpages.cat)

Estos hallazgos vienen de una evaluación técnica **de sólo lectura** sobre la
tienda real. No son hipótesis: son datos medidos. Condicionan el diseño del
esquema y de la integración — ver los ADRs correspondientes en
`decisiones-arquitectura.md`.

## Entorno

- WooCommerce 10.9.3, WordPress, PHP 8.5, 39 extensiones activas.
- API a usar: **`/wp-json/wc/v3/`** (la moderna). **No** la legacy
  `/wc-api/v3/` — usa otros nombres de campo (`title` vs `name`,
  `created_at` vs `date_created`). Hay documentación vieja circulando que la
  referencia; hay que ignorarla.
- Moneda EUR, peso en kg.
- Almacenamiento de pedidos de alto rendimiento activo (HPOS): el esquema de
  pedidos vive en tablas propias de WooCommerce, no en `wp_posts`.
- Latencia observada: ~3 segundos por consulta.
- Sin bloqueos de firewall detectados durante la evaluación.
- Los importes llegan **sin IVA** y con decimales largos (ejemplo:
  `7,27272725 €` = `8,00 €` con IVA al 10%).

## Catálogo (253 registros, ~111 artículos reales)

- **Crítico — catálogo duplicado por idioma (Polylang).** Cada artículo
  existe dos veces, catalán y castellano, **compartiendo el mismo código
  (SKU)**. Ejemplo: "Llom" (id 6245) y "Lomo" (id 6335) son ambos el código
  `LLF01`. 109 de 111 códigos aparecen dos veces.
- **Ambas versiones reciben pedidos**: 1.774 líneas apuntan a la versión
  catalana y 1.647 a la castellana. 37 pedidos mezclan ambos idiomas en la
  misma cesta. Por lo tanto no se puede descartar ninguna versión, y el
  mapeo **no puede ser** `woo_product_id → artículo`. Hace falta una tabla de
  alias (ver ADR-008).
- **El peso no está informado**: 2 de 253 productos, y con valor erróneo
  (10 kg en un solomillo). 0 de 64 variaciones tienen peso. El peso vendrá de
  una carga de artículos que facilita el cliente, no de WooCommerce.
- **14 artículos publicados sin código**, incluido "Botifarra blanca" (3.º
  más vendido, 144 líneas de pedido en 6 meses) y "Frankfurt Eco" (61).
- 16 productos variables con 64 variaciones, diferenciadas por los atributos
  "Presentació" y "Talla". Sólo el 46,9% de las variaciones tiene código
  propio, y un mismo código llega a repetirse en 8 variaciones.
- El gramaje a veces está dentro del propio código (ej. SKU `BOT01750g`) o en
  texto libre del atributo Presentació ("250 gr", "600 gr", "4 unitats").

## Pedidos (411 en 6 meses, 4.248 históricos)

- Media de 8,3 líneas por pedido, máximo 23. 99,6% de líneas con SKU.
- Los pedidos traen **unidades, nunca kilos**. El kilaje se calcula:
  unidades × peso por unidad del artículo (que sale de nuestra propia tabla).
- **No existe fecha de entrega, producción ni expedición** en WooCommerce.
  Se revisaron las 22 claves de meta_data de pedido existentes: ninguna las
  contiene. Esas tres fechas son 100% nuestras.
- 45,5% de pedidos con cupón de descuento. Un solo código
  (`nestorblanca`) aparece en 158 pedidos de 68 clientes distintos, con
  1.654 € descontados.
- El NIF del cliente llega en **dos campos distintos** de meta_data: `nif` y
  `_billing_myfield5`. Cobertura del 57%, y en 5 de 41 casos con ambos,
  difieren entre sí.
- 23,4% de pedidos son de invitados (`customer_id = 0`). Sólo 10 de ellos
  traen NIF.
- 11 métodos de envío distintos que mezclan zona, gratuidad e idioma. No
  identifican al transportista.
- `modified_after` funciona correctamente tanto en `/orders` como en
  `/products` — confirmado con pruebas reales. Las cabeceras `X-WP-Total` y
  `X-WP-TotalPages` están presentes.

## Las seis reglas de consulta obligatorias

Se pierden registros si no se respetan todas:

1. `dates_are_gmt=true` **siempre**; comparar contra `date_modified_gmt`.
2. `orderby=modified&order=asc` — ordenar `desc` rompe la paginación si algo
   se modifica mientras se está paginando.
3. Ventana de solapamiento: restar 5 minutos al cursor guardado antes de
   consultar.
4. Avanzar el cursor **sólo** si el lote completo se procesó bien.
5. `status=any` en pedidos, para capturar cancelaciones.
6. Paginar por `X-WP-TotalPages` (cabecera), nunca "hasta que venga vacío".

## Cómo se obtuvieron estos datos

Script de exploración de un solo uso, sólo peticiones GET, con throttling y
manejo de errores por endpoint. No forma parte del servicio; su sucesor vive
en `packages/backend/src/scripts/` para cuando haga falta re-perfilar la
tienda (por ejemplo, al recibir la tabla maestra de artículos del cliente).
