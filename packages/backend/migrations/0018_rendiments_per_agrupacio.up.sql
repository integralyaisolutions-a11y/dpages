-- Issues #3/#4 del reporte de Francesc, migración YA DECIDIDA y validada
-- con Michelle (frontend). rendiments_porcs identificaba cada fila por
-- producte_id, pero el rendimiento real de un cerdo se define por
-- Agrupació Producció (un grupo que engloba varios productos, ej. "Lomo"),
-- no por producto individual — con el modelo viejo, cargar el rendimiento
-- de UN producto del grupo no beneficiaba a los demás: Panell Producció
-- (panells.ts) sólo calculaba bien para el/los producto(s) cuyo id_seq
-- ganaba el desempate de `array_agg(...)[1] ORDER BY p.id_seq`, el resto de
-- la agrupación podía quedar sin rendimiento en el cálculo, en silencio.
--
-- Migración MÍNIMA (clave compuesta categoria_id + agrupacio_produccio),
-- no una entidad nueva: confirmado con SQL real sobre el catálogo completo
-- (dev y prod, 160 productos) que hoy NO existe ningún caso de un mismo
-- agrupacio_produccio cruzando categorías distintas — la pareja ya
-- identifica al grupo sin ambigüedad, no hace falta normalizar.
--
-- Nota sobre transacciones: el runner (db/migrate.ts) ya envuelve el
-- contenido completo de este archivo en un solo BEGIN/COMMIT — no hace
-- falta un BEGIN propio acá (mismo criterio que la migración 0013).

-- Paso 1: columnas nuevas, nullable por ahora — se backfillean antes de
-- exigir NOT NULL y de soltar producte_id.
ALTER TABLE rendiments_porcs ADD COLUMN categoria_id UUID REFERENCES categoria_producte(id);
ALTER TABLE rendiments_porcs ADD COLUMN agrupacio_produccio TEXT;

-- Paso 2: backfill desde el modelo viejo — cada fila hereda la categoria y
-- la agrupació de producció del producte al que apuntaba (dev/local están
-- vacías al momento de escribir esto, pero el backfill corre igual: esta
-- migración también se aplica contra producción, con datos reales).
UPDATE rendiments_porcs r
SET categoria_id = p.categoria_id, agrupacio_produccio = p.agrupacio_produccio
FROM producte p
WHERE p.id = r.producte_id;

-- Chequeo defensivo: bajo el modelo viejo, POST /rendiments-porcs ya exigía
-- que la categoria del producte tuviera agrupacio_rendiment definida (lo
-- que a su vez implica elaborat_porc = true), y el negocio confirmó que
-- esas categorias siempre traen agrupacio_produccio informado — ninguna
-- fila debería poder quedar sin él tras el backfill. Si algo inesperado
-- rompe esa invariante, mejor que la migración falle acá (y se revierta
-- sola) a que categoria_id/agrupacio_produccio queden en NULL en silencio.
DO $$
DECLARE
  sense_agrupacio INTEGER;
BEGIN
  SELECT count(*) INTO sense_agrupacio FROM rendiments_porcs WHERE agrupacio_produccio IS NULL;
  IF sense_agrupacio > 0 THEN
    RAISE EXCEPTION 'rendiments_porcs quedó con % fila(s) sin agrupacio_produccio tras el backfill — revisar antes de continuar', sense_agrupacio;
  END IF;
END $$;

-- Paso 3: ahora sí, exigibles.
ALTER TABLE rendiments_porcs ALTER COLUMN categoria_id SET NOT NULL;
ALTER TABLE rendiments_porcs ALTER COLUMN agrupacio_produccio SET NOT NULL;

-- Paso 4: fuera el modelo viejo.
DROP INDEX idx_rendiments_porcs_producte_id;
ALTER TABLE rendiments_porcs DROP COLUMN producte_id;

-- Como máximo una fila de rendiment por grupo — la garantía real que
-- justifica esta migración: Panell Producció ya no necesita desempatar
-- entre varias filas candidatas por agrupación (ver panells.ts), y
-- POST /rendiments-porcs traduce la violación de esto a 409 CONFLICTE.
ALTER TABLE rendiments_porcs
  ADD CONSTRAINT rendiments_porcs_categoria_agrupacio_unique UNIQUE (categoria_id, agrupacio_produccio);
