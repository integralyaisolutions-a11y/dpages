DROP TABLE IF EXISTS incidencia_comanda;

ALTER TABLE comanda DROP COLUMN IF EXISTS estat_web;

ALTER TABLE comanda_linia DROP COLUMN IF EXISTS woo_sku;
ALTER TABLE comanda_linia DROP COLUMN IF EXISTS woo_variation_id;
ALTER TABLE comanda_linia DROP COLUMN IF EXISTS woo_product_id;

ALTER TABLE comanda_linia DROP CONSTRAINT comanda_linia_pes_calculat_kg_check;
ALTER TABLE comanda_linia ADD CONSTRAINT comanda_linia_pes_calculat_kg_check CHECK (pes_calculat_kg > 0);

ALTER TABLE comanda_linia ALTER COLUMN producte_id SET NOT NULL;
