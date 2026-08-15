-- confirmat_a/confirmat_per en vez de confirmat_empaquetat (boolean): un
-- booleano pierde trazabilidad. La diferencia entre lo pedido y lo
-- entregado determina si se emite un abono o se cobra de más — hace falta
-- saber CUÁNDO se confirmó cada línea y QUIÉN, no sólo que alguien lo hizo.
-- Mismo patrón que congelat_a.
ALTER TABLE comanda_linia ADD COLUMN confirmat_a TIMESTAMPTZ;
-- Sin FK todavía: la tabla de usuarios llega con Firebase Auth en una capa
-- posterior. TEXT porque un uid de Firebase no es un UUID de Postgres.
ALTER TABLE comanda_linia ADD COLUMN confirmat_per TEXT;
ALTER TABLE comanda_linia DROP COLUMN confirmat_empaquetat;

-- Categorías: confirmadas (existen en WooCommerce, las pantallas de
-- catálogo y de obrador filtran por ellas) — sólo agrupacioRendiment queda
-- pendiente. Duplicadas por idioma igual que los artículos (Fresc/Fresco):
-- una fila de categoria_producte por categoría REAL, resuelta por nombre
-- canónico en la transformación, nunca por el nombre crudo de WooCommerce
-- (si no, el catálogo queda repartido entre categorías "equivalentes").
CREATE TABLE IF NOT EXISTS categoria_producte (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom       TEXT NOT NULL UNIQUE,
  creat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE producte ADD COLUMN categoria_id UUID REFERENCES categoria_producte (id);
CREATE INDEX IF NOT EXISTS idx_producte_categoria_id ON producte (categoria_id);
