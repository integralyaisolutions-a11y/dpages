-- Capa 40 — Panell Obrador no tenía forma de marcar una línea como
-- "trabajada", a diferencia de Empaquetat (confirmat_a/confirmat_per, ver
-- migración 0006). Mismo patrón de par nullable timestamptz/autor.
--
-- A diferencia de confirmat_per (TEXT, uid de Firebase — se diseñó ANTES de
-- que existiera la tabla `usuari`, migración 0014, y nunca se migró
-- después), treballat_per SÍ es un UUID con FK real a usuari(id): la tabla
-- ya existe, no hay motivo para repetir la deuda técnica en una columna
-- nueva. Sin ON DELETE — si algún día se borra un usuario, borrar su
-- usuari sin decidir qué pasa con las líneas que marcó sería un cambio de
-- comportamiento silencioso, no algo para resolver de paso acá.
ALTER TABLE comanda_linia ADD COLUMN treballat_a TIMESTAMPTZ;
ALTER TABLE comanda_linia ADD COLUMN treballat_per UUID REFERENCES usuari (id);
