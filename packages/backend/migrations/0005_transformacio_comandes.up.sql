-- Las 14 artículos publicados sin código (hallazgos-woocommerce.md) hacen
-- que una línea pueda quedar SIN artículo resuelto — no se descarta, se
-- guarda con producte_id nulo y la comanda se marca con incidencia.
ALTER TABLE comanda_linia ALTER COLUMN producte_id DROP NOT NULL;

-- Peso "a medida" (sin peso de ficha) empieza en 0 — es un estado válido a
-- la espera de que alguien lo complete, no un error. La migración 0003 lo
-- dejaba en > 0, que era demasiado estricto: hacía imposible insertar la
-- línea en su estado inicial correcto.
ALTER TABLE comanda_linia DROP CONSTRAINT comanda_linia_pes_calculat_kg_check;
ALTER TABLE comanda_linia ADD CONSTRAINT comanda_linia_pes_calculat_kg_check CHECK (pes_calculat_kg >= 0);

-- Traza cruda de WooCommerce en la línea: aunque la resolución de artículo
-- falle del todo, queda registro de qué producto/variación/sku traía la
-- línea, para poder resolverla a mano más adelante sin tener que volver a
-- pegarle a la API (ADR-003 aplicado también acá).
ALTER TABLE comanda_linia ADD COLUMN IF NOT EXISTS woo_product_id BIGINT;
ALTER TABLE comanda_linia ADD COLUMN IF NOT EXISTS woo_variation_id BIGINT;
ALTER TABLE comanda_linia ADD COLUMN IF NOT EXISTS woo_sku TEXT;

-- "Estado web": el status crudo de WooCommerce (processing/completed/...),
-- distinto de comanda.estat (el flujo operativo propio del sistema). Es
-- propiedad del sync (ADR-005) — no existía columna para esto todavía.
ALTER TABLE comanda ADD COLUMN IF NOT EXISTS estat_web TEXT;

-- Incidencias: ADR-007 y la resolución de artículo dicen "se registra como
-- incidencia", pero no había dónde. Sin esto, "amb_incidencia" era un
-- estado sin explicación — oficina vería la marca pero no el motivo.
CREATE TABLE IF NOT EXISTS incidencia_comanda (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id  UUID NOT NULL REFERENCES comanda (id) ON DELETE CASCADE,
  tipus       TEXT NOT NULL,
  detall      TEXT NOT NULL,
  creat_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolta     BOOLEAN NOT NULL DEFAULT false,
  resolta_en  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidencia_comanda_comanda_id
  ON incidencia_comanda (comanda_id);
CREATE INDEX IF NOT EXISTS idx_incidencia_comanda_no_resoltes
  ON incidencia_comanda (comanda_id) WHERE NOT resolta;
