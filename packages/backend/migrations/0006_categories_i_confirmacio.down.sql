ALTER TABLE producte DROP COLUMN IF EXISTS categoria_id;
DROP TABLE IF EXISTS categoria_producte;

ALTER TABLE comanda_linia ADD COLUMN confirmat_empaquetat BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE comanda_linia DROP COLUMN IF EXISTS confirmat_per;
ALTER TABLE comanda_linia DROP COLUMN IF EXISTS confirmat_a;
