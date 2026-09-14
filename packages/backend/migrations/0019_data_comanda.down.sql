-- Reversión SIMPLE: soltar la columna. Sin pérdida de información real —
-- creat_en (el timestamp de auditoría del que se hizo el backfill) nunca se
-- tocó, sigue intacto — a diferencia de la migración 0018, acá no hace
-- falta reconstruir nada ni documentar ninguna pérdida.
ALTER TABLE comanda DROP COLUMN data_comanda;
