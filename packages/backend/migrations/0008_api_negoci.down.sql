ALTER TABLE comanda_linia DROP COLUMN IF EXISTS obs_produccio;

ALTER TABLE comanda RENAME COLUMN data_lliurament TO data_entrega;
ALTER TABLE comanda RENAME COLUMN obs_produccio TO observacions;
ALTER TABLE comanda DROP COLUMN IF EXISTS obs_lliurament;
ALTER TABLE comanda DROP COLUMN IF EXISTS bultos;

DROP TRIGGER IF EXISTS trg_comanda_generar_num ON comanda;
DROP FUNCTION IF EXISTS comanda_generar_num();
ALTER TABLE comanda DROP COLUMN IF EXISTS num;
ALTER TABLE comanda DROP COLUMN IF EXISTS num_seq;

ALTER TABLE transportista DROP COLUMN IF EXISTS actiu;

ALTER TABLE client DROP COLUMN IF EXISTS actiu;
ALTER TABLE client DROP COLUMN IF EXISTS transportista_defecte_id;
ALTER TABLE client DROP COLUMN IF EXISTS tarifa_id;
ALTER TABLE client DROP COLUMN IF EXISTS poblacio;
ALTER TABLE client DROP COLUMN IF EXISTS telefon;
ALTER TABLE client DROP COLUMN IF EXISTS nom;
ALTER TABLE client DROP COLUMN IF EXISTS codi;

DROP TABLE IF EXISTS tarifa_preu;

ALTER TABLE producte DROP COLUMN IF EXISTS tipus;
ALTER TABLE producte DROP COLUMN IF EXISTS preu_venda;
ALTER TABLE producte DROP COLUMN IF EXISTS descripcio_venda;
ALTER TABLE producte RENAME COLUMN descripcio TO nom;

ALTER TABLE categoria_producte DROP COLUMN IF EXISTS agrupacio_rendiment;
ALTER TABLE categoria_producte DROP COLUMN IF EXISTS elaborat_porc;

ALTER TABLE comanda_linia DROP COLUMN IF EXISTS id_seq;
ALTER TABLE comanda      DROP COLUMN IF EXISTS id_seq;
ALTER TABLE transportista DROP COLUMN IF EXISTS id_seq;
ALTER TABLE client        DROP COLUMN IF EXISTS id_seq;
ALTER TABLE tarifa        DROP COLUMN IF EXISTS id_seq;
ALTER TABLE producte      DROP COLUMN IF EXISTS id_seq;
ALTER TABLE categoria_producte DROP COLUMN IF EXISTS id_seq;
