DROP TABLE IF EXISTS origen_comanda;

DROP INDEX IF EXISTS idx_transportista_codi;
ALTER TABLE transportista DROP COLUMN IF EXISTS codi;

ALTER TABLE categoria_producte DROP CONSTRAINT IF EXISTS categoria_producte_agrupacio_rendiment_check;

ALTER TABLE producte DROP COLUMN IF EXISTS envasat;
ALTER TABLE producte DROP COLUMN IF EXISTS format;
ALTER TABLE producte DROP COLUMN IF EXISTS agrupacio_produccio;
