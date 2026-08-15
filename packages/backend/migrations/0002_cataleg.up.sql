CREATE TABLE IF NOT EXISTS producte (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 14 artículos publicados en WooCommerce no tienen código: nullable.
  codi      TEXT,
  nom       TEXT NOT NULL,
  -- NUMERIC(10,3): kg, 3 decimales, confirmado por el cliente. Null cuando
  -- el artículo es "a medida" (sin peso de ficha).
  pes_kg    NUMERIC(10,3),
  actiu     BOOLEAN NOT NULL DEFAULT true,
  creat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Único entre los artículos que SÍ tienen código (permite múltiples NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_producte_codi
  ON producte (codi) WHERE codi IS NOT NULL;

-- Tabla de alias (ADR-008): el catálogo está duplicado por idioma en
-- WooCommerce (mismo SKU, dos product_id), y ambas versiones reciben
-- pedidos. Cada artículo tiene además un woo_variation_id propio por cada
-- variación suya (0 = la fila del producto en sí, no una variación).
CREATE TABLE IF NOT EXISTS alias_producte (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producte_id       UUID NOT NULL REFERENCES producte (id),
  woo_product_id    BIGINT NOT NULL,
  -- 0 = el producto (simple o padre variable) en sí, no una variación. No
  -- se usa NULL para poder incluir la columna en la UNIQUE de abajo sin el
  -- problema de que NULL <> NULL en Postgres.
  woo_variation_id  BIGINT NOT NULL DEFAULT 0,
  idioma            TEXT NOT NULL CHECK (idioma IN ('ca', 'es')),
  -- El SKU tal como viene en ESA fila/variación de WooCommerce; puede
  -- diferir de producte.codi si hay inconsistencia entre idiomas.
  codi              TEXT,
  creat_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (woo_product_id, woo_variation_id)
);

CREATE INDEX IF NOT EXISTS idx_alias_producte_producte_id
  ON alias_producte (producte_id);

CREATE INDEX IF NOT EXISTS idx_alias_producte_codi
  ON alias_producte (codi) WHERE codi IS NOT NULL;
