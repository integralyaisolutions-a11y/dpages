-- Tabla de aterrizaje cruda (ADR-003): el JSON completo de cada recurso de
-- WooCommerce, upserted por (recurs, woo_id). Permite reprocesar sin volver
-- a pegarle a la API del cliente.
CREATE TABLE IF NOT EXISTS aterratge_woocommerce (
  recurs       TEXT NOT NULL,
  woo_id       BIGINT NOT NULL,
  payload      JSONB NOT NULL,
  capturat_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recurs, woo_id)
);

-- Estado del cursor de polling incremental por recurso ("comandes",
-- "cataleg"...). El sync sólo avanza este valor si el lote completo se
-- procesó bien (ver ADR-002) — la resta de los 5 minutos de solapamiento se
-- aplica en el código, no acá.
CREATE TABLE IF NOT EXISTS cursor_sincronitzacio (
  recurs          TEXT PRIMARY KEY,
  cursor_en       TIMESTAMPTZ NOT NULL,
  actualitzat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eventos de webhook recibidos. El webhook es una notificación, no la
-- fuente del dato (ADR-002): esta tabla es para idempotencia (no procesar
-- el mismo evento dos veces) y auditoría, no para leer el estado del pedido.
CREATE TABLE IF NOT EXISTS esdeveniment_webhook (
  id                BIGSERIAL PRIMARY KEY,
  woo_order_id      BIGINT NOT NULL,
  topic             TEXT NOT NULL,
  signatura_valida  BOOLEAN NOT NULL,
  rebut_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  processat         BOOLEAN NOT NULL DEFAULT false,
  processat_en      TIMESTAMPTZ,
  error             TEXT
);

CREATE INDEX IF NOT EXISTS idx_esdeveniment_webhook_woo_order_id
  ON esdeveniment_webhook (woo_order_id);
