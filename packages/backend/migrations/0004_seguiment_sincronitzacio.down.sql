ALTER TABLE cursor_sincronitzacio DROP COLUMN IF EXISTS intents_fallits_consecutius;
ALTER TABLE cursor_sincronitzacio DROP COLUMN IF EXISTS ultim_error_en;
ALTER TABLE cursor_sincronitzacio DROP COLUMN IF EXISTS ultim_error;
ALTER TABLE cursor_sincronitzacio ALTER COLUMN cursor_en SET NOT NULL;
