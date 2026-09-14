-- Issue #16 (Francesc, Bloqueante): el sistema permitía guardar un pedido
-- sin NINGUNA fecha (ni Data comanda, ni Data lliurament, ni Data producció
-- de línia). Reglas de negocio confirmadas (Michelle/Francesc):
--   1. Data comanda: HOY por defecto, EDITABLE, OBLIGATORIA.
--   2. Data lliurament (cabecera): HOY por defecto, OBLIGATORIA.
--   3. Data producció (por línia): OBLIGATORIA, sin valor por defecto.
-- Esta migración cubre el punto 1 — 2 y 3 son validación de aplicación
-- (comandes.ts), no tocan esquema (las columnas ya existían y ya admitían
-- NOT NULL a nivel de fila individual, sólo faltaba exigirlas en la API).
--
-- Cambio de modelo CONSCIENTE: hasta ahora "Data comanda" en la API
-- (`dataComanda`) era directamente `comanda.creat_en` (el timestamp
-- automático de Postgres al insertar la fila) — no existía como campo de
-- entrada en absoluto. Se separa a propósito: `creat_en` SIGUE siendo el
-- timestamp real e inalterable de auditoría (cuándo entró la fila a la
-- base, nunca se edita, migración 0003) — `data_comanda` es la columna
-- NUEVA, el dato de negocio editable que ve el usuario. DATE (no
-- TIMESTAMPTZ): "Data comanda" es una fecha de calendario sin componente
-- de hora, tal como la pide el negocio (a diferencia de data_lliurament/
-- data_produccio/data_expedicio, que sí son instantes reales).
--
-- Nota sobre transacciones: el runner (db/migrate.ts) ya envuelve el
-- contenido completo de este archivo en un solo BEGIN/COMMIT — mismo
-- criterio que las migraciones 0013/0018.

ALTER TABLE comanda ADD COLUMN data_comanda DATE;

-- Backfill: para cualquier pedido ya existente, el mejor proxy real de "qué
-- día se hizo el pedido" sigue siendo el día en que entró al sistema —
-- exactamente el criterio que regía hasta ahora (dataComanda = creat_en).
UPDATE comanda SET data_comanda = creat_en::date;

-- Chequeo defensivo: todo comanda tiene creat_en NOT NULL (default now(),
-- migración 0003) — ninguna fila debería poder quedar sin data_comanda tras
-- el backfill. Si algo inesperado lo deja así, mejor que la migración falle
-- acá (y se revierta sola) a que quede una fila con NULL silencioso.
DO $$
DECLARE
  sense_data INTEGER;
BEGIN
  SELECT count(*) INTO sense_data FROM comanda WHERE data_comanda IS NULL;
  IF sense_data > 0 THEN
    RAISE EXCEPTION 'comanda quedó con % fila(s) sin data_comanda tras el backfill — revisar antes de continuar', sense_data;
  END IF;
END $$;

ALTER TABLE comanda ALTER COLUMN data_comanda SET NOT NULL;
