-- Cambio C: revierte sólo estructura, no el backfill de datos (mismo
-- criterio que el resto del proyecto — ver down.sql de 0011/0012).
COMMENT ON COLUMN comanda.origen IS NULL;
ALTER TABLE comanda ALTER COLUMN origen SET NOT NULL;
ALTER TABLE comanda ADD CONSTRAINT comanda_origen_check
  CHECK (origen IN ('web', 'email', 'whatsapp', 'telefon'));
ALTER TABLE comanda DROP COLUMN IF EXISTS origen_id;

-- Cambio B: restaura la función vieja (año + 4 dígitos). El backfill de
-- datos NO se revierte (mismo criterio ya usado en migraciones anteriores
-- para datos — sólo se revierte estructura).
CREATE OR REPLACE FUNCTION comanda_generar_num() RETURNS TRIGGER AS $$
BEGIN
  NEW.num := to_char(NEW.creat_en, 'YYYY') || '-' || lpad(NEW.num_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
