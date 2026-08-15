# Contrato de API — backend dPagès

Este documento describe los endpoints HTTP expuestos por
`packages/backend`. Se completa a medida que se implementan — todavía no hay
servidor Fastify (llega en la capa "servidor HTTP"), así que por ahora es un
esqueleto con lo planificado.

## Convención para documentar un endpoint

```
### MÉTODO /ruta

Quién lo llama · Autenticación

Request: ...
Response: ...
Idempotencia: ...
```

## Planificados, no implementados todavía

### GET /salud

Health check de Cloud Run. Sin autenticación. Responde rápido, sin tocar la
base de datos en el camino crítico (o con un chequeo mínimo y barato si la
toca).

### POST /tasques/sync-comandes

Lo dispara Cloud Scheduler cada 5 minutos (ver ADR-009). Ejecuta ingesta +
transformación incremental de pedidos desde WooCommerce. Protegido: token
OIDC de Cloud Scheduler en producción, secreto compartido por variable de
entorno en local. Idempotente — un reintento de Scheduler no debe duplicar
trabajo.

### POST /tasques/sync-cataleg

Lo dispara Cloud Scheduler 2 veces al día. Ingesta + transformación de
catálogo. Mismas garantías de autenticación e idempotencia que
`sync-comandes`.

### POST /tasques/reconciliar

Lo dispara Cloud Scheduler (frecuencia a definir, ej. diaria). Reconciliación
con ventana amplia de 7 días. Mismas garantías de autenticación e
idempotencia.

### POST /webhooks/woocommerce

Lo llama WooCommerce ante cambios de pedido. Valida
`x-wc-webhook-signature` (HMAC-SHA256 del body crudo, base64) antes de
parsear el JSON. Es una notificación, no la fuente del dato: al recibirla,
hace `GET /orders/{id}` contra WooCommerce para traer el estado canónico.

## Fuera de alcance por ahora

Los endpoints CRUD que van a consumir los cuatro paneles (oficina, obrador,
empaquetado, producció/planificació) todavía no están definidos — se agregan
cuando se construya la capa de servidor HTTP con esos casos de uso
concretos.
