-- Sólo reversión de esquema. Los datos que movió el paso de limpieza
-- (comanda_linia/comanda/incidencia_comanda, producte/alias_producte
-- borrados) NO se restauran acá — igual que el resto de los .down.sql de
-- este proyecto, no son el mecanismo real de rollback (eso es restaurar
-- desde backup).
DROP TABLE IF EXISTS incidencia_cataleg;
