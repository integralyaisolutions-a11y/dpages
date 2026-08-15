-- cursor_en pasa a ser nullable: NULL significa "todavía no hubo ninguna
-- ingesta exitosa de este recurso" (carga completa pendiente). Antes de esta
-- migración la fila ni existía hasta el primer éxito; ahora se crea/actualiza
-- en CADA intento (éxito o fallo) para poder ver fallos consecutivos sin
-- haber tenido nunca un cursor.
ALTER TABLE cursor_sincronitzacio ALTER COLUMN cursor_en DROP NOT NULL;

-- Registro de fallos: si la tienda lleva rato caída, tiene que verse acá sin
-- bucear en logs. Se limpian (vuelven a NULL/0) en cada ingesta exitosa.
ALTER TABLE cursor_sincronitzacio ADD COLUMN IF NOT EXISTS ultim_error TEXT;
ALTER TABLE cursor_sincronitzacio ADD COLUMN IF NOT EXISTS ultim_error_en TIMESTAMPTZ;
ALTER TABLE cursor_sincronitzacio ADD COLUMN IF NOT EXISTS intents_fallits_consecutius INTEGER NOT NULL DEFAULT 0;
