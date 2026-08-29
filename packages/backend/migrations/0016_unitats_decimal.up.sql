-- Capa 38 — Michel reportó que comanda_linia.unitats_lliurades (INTEGER)
-- bloquea entregas parciales de pieza (ej. 2.5 unidades cuando no se
-- produjo la pieza completa). Gerardo confirmó ampliar el alcance:
-- unitats_demanades pasa al mismo criterio, no sólo el entregado — no
-- tendría sentido poder ENTREGAR 2.5 de algo que sólo se pudo PEDIR en
-- enteros.
--
-- Precisión NUMERIC(10,2): alcanza para cuartos/mitades de pieza, no hace
-- falta la de los kilos (NUMERIC(10,3)).
--
-- El CHECK (unitats_demanades > 0) de la migración 0003 sigue siendo válido
-- tal cual sobre NUMERIC — no hace falta tocarlo.
ALTER TABLE comanda_linia
  ALTER COLUMN unitats_demanades TYPE NUMERIC(10,2),
  ALTER COLUMN unitats_lliurades TYPE NUMERIC(10,2);
