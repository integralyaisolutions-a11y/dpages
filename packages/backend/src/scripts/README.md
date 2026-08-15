# Scripts de diagnóstico

Utilidades ejecutables de un solo uso: no son parte del servicio, no se
despliegan a Cloud Run. Se corren a mano desde este paquete con `tsx`.

Previstas:

- **Perfilado de la tienda WooCommerce** — reutilizando
  `src/woocommerce/cliente.ts` una vez exista. Se necesita de nuevo cuando el
  cliente entregue la tabla maestra de artículos (para cruzarla contra lo
  que hay hoy en WooCommerce).
- Verificación de conectividad a la base de datos / a WooCommerce.
- Cargas puntuales (por ejemplo, la importación inicial de pesos por
  artículo).

Todavía no hay scripts acá: se agregan en la capa que corresponde (el
perfilador se porta cuando exista el cliente de WooCommerce, no antes).
