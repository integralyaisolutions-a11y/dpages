DROP INDEX IF EXISTS idx_tarifa_codi;
ALTER TABLE tarifa DROP COLUMN IF EXISTS codi;

ALTER TABLE comanda DROP COLUMN IF EXISTS adreca_lliurament;

ALTER TABLE comanda_linia DROP COLUMN IF EXISTS data_produccio;
