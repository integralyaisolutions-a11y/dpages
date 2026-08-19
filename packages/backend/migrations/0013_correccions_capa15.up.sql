-- Capa 15: correcciones sobre código YA DESPLEGADO (a diferencia de las
-- migraciones 0011/0012, aditivas). Dos cambios agrupados en un mismo
-- archivo porque ambos tocan `comanda` y se decidieron juntos.
--
-- Nota sobre transacciones: el runner (db/migrate.ts) ya envuelve el
-- contenido completo de cada archivo de migración en un solo BEGIN/COMMIT
-- — un BEGIN explícito acá adentro sería una transacción anidada redundante
-- (Postgres sólo emite un warning y la ignora, pero no aporta nada). Si
-- cualquier sentencia de acá abajo falla, TODO el archivo se revierte solo.

-- ── Cambio B: formato de comanda.num ────────────────────────────────────
-- comanda_generar_num() (migración 0008) generaba "AAAA-NNNN" (año + 4
-- dígitos). El contrato/prototipo real usa "NNNNNN" (6 dígitos, sin año).
CREATE OR REPLACE FUNCTION comanda_generar_num() RETURNS TRIGGER AS $$
BEGIN
  NEW.num := lpad(NEW.num_seq::text, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill de TODOS los pedidos ya existentes, no sólo los nuevos — el
-- trigger sólo corre en INSERT (mismo criterio que el backfill original,
-- migración 0008).
UPDATE comanda SET num = lpad(num_seq::text, 6, '0');

-- Chequeo de seguridad: num_seq ya es único por construcción (columna
-- GENERATED ALWAYS AS IDENTITY, migración 0008), así que esto no debería
-- poder dispararse nunca — pero si algo inesperado deja dos comanda.num
-- iguales, mejor que la migración falle acá (y se revierta sola, ver
-- db/migrate.ts) a que quede el dato así.
DO $$
DECLARE
  duplicats INTEGER;
BEGIN
  SELECT count(*) INTO duplicats FROM (
    SELECT num FROM comanda GROUP BY num HAVING count(*) > 1
  ) sub;
  IF duplicats > 0 THEN
    RAISE EXCEPTION 'comanda.num quedó con % valor(es) duplicado(s) tras el backfill del nuevo formato — revisar antes de continuar', duplicats;
  END IF;
END $$;

-- ── Cambio C: comanda.origen pasa a ser FK a origen_comanda ─────────────
-- origen_comanda ya existe desde la capa 13 (migración 0011), con sus dos
-- filas sembradas (woocommerce/manual) por seed-arranque.ts.
ALTER TABLE comanda ADD COLUMN origen_id UUID REFERENCES origen_comanda(id);

-- Backfill: el criterio real de "de dónde vino este pedido" ya vive en
-- woo_order_id (NULL = capturado a mano) — no en el valor libre que tenía
-- la columna vieja `origen` (que distinguía web/email/whatsapp/telefon, un
-- desglose que el negocio ya no usa, ver CanalOrigen en packages/shared).
UPDATE comanda SET origen_id = (SELECT id FROM origen_comanda WHERE codi = 'woocommerce')
WHERE woo_order_id IS NOT NULL;
UPDATE comanda SET origen_id = (SELECT id FROM origen_comanda WHERE codi = 'manual')
WHERE woo_order_id IS NULL;

ALTER TABLE comanda ALTER COLUMN origen_id SET NOT NULL;

-- El CHECK viejo (migración 0003) se definió inline en la columna, sin
-- nombre explícito — Postgres lo nombró con la convención estándar
-- <tabla>_<columna>_check (mismo patrón ya referenciado en
-- comanda_linia_pes_calculat_kg_check, migración 0005).
ALTER TABLE comanda DROP CONSTRAINT comanda_origen_check;

-- La columna vieja queda, deprecated, para no hacer un cambio más
-- arriesgado todavía (borrarla es una migración aparte, más adelante,
-- según lo pedido). El código nuevo ya no la lee ni la escribe — y por eso
-- también se relaja el NOT NULL original (migración 0003): si nada la
-- escribe más, no puede seguir siendo obligatoria en cada INSERT.
ALTER TABLE comanda ALTER COLUMN origen DROP NOT NULL;
COMMENT ON COLUMN comanda.origen IS
  'DEPRECATED (migración 0013) — reemplazada por origen_id/origen_comanda. No se lee ni se escribe desde el código nuevo. Se elimina en una migración aparte más adelante.';
