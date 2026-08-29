-- Revierte a INTEGER. Trunca cualquier valor fraccionario que se haya
-- guardado mientras tanto (mismo riesgo que cualquier down-migration que
-- reduce precisión) — aceptable porque este down sólo se usa para revertir
-- la migración recién aplicada, no como operación normal.
ALTER TABLE comanda_linia
  ALTER COLUMN unitats_demanades TYPE INTEGER USING round(unitats_demanades)::integer,
  ALTER COLUMN unitats_lliurades TYPE INTEGER USING round(unitats_lliurades)::integer;
