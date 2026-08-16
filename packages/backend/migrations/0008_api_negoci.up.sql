-- Capa 8 (ADR-019): el contrato de API (docs/contrato-api.md) usa
-- identificadores enteros pequeños en TODA respuesta ("id": 12, "id": 142,
-- "id": 981...) — son los que Michel copia tal cual en sus mocks. Las claves
-- primarias internas siguen siendo UUID (no se tocan, siguen siendo lo que
-- usan las FK y el resto del sync), pero cada tabla que se expone por API
-- necesita además un entero secuencial de sólo lectura para el mundo
-- externo. GENERATED ALWAYS AS IDENTITY lo rellena solo, incluso en tablas
-- ya pobladas (los 4.250 pedidos, los 111 producte...).
ALTER TABLE categoria_producte ADD COLUMN id_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE producte           ADD COLUMN id_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE tarifa             ADD COLUMN id_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE client             ADD COLUMN id_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE transportista      ADD COLUMN id_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE comanda            ADD COLUMN id_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE comanda_linia      ADD COLUMN id_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE;

-- ── categoria_producte ──────────────────────────────────────────────────
-- elaboratPorc es clasificación de negocio (si la categoría es un producto
-- elaborado de porc) que no viene de ningún campo de WooCommerce — arranca
-- en false para las 16 categorías ya existentes y hace falta revisarlas a
-- mano vía PATCH /categories/:id, no se puede inferir de forma confiable.
ALTER TABLE categoria_producte ADD COLUMN elaborat_porc BOOLEAN NOT NULL DEFAULT false;
-- Siempre null por ahora (contrato, sección 7): el cliente todavía no
-- definió los campos de agrupación del catálogo.
ALTER TABLE categoria_producte ADD COLUMN agrupacio_rendiment TEXT;

-- ── producte ─────────────────────────────────────────────────────────────
-- El contrato distingue "descripcio" (nombre técnico/completo, lo que ya
-- veníamos guardando en "nom") de "descripcioVenda" (nombre corto de venta,
-- dato nuevo que todavía no existe en ningún lado — se completa a mano).
ALTER TABLE producte RENAME COLUMN nom TO descripcio;
ALTER TABLE producte ADD COLUMN descripcio_venda TEXT;
-- preuVenda: precio base de venta. Dato nuevo, sin origen en WooCommerce ni
-- en el sync — se completa a mano vía PATCH, igual que pesKg.
ALTER TABLE producte ADD COLUMN preu_venda NUMERIC(10,2);
-- tipus (simple/variable) sí viene de WooCommerce (payload.type), pero
-- nunca se había guardado. Default 'simple' para no romper el INSERT del
-- sync mientras se hace el backfill de abajo.
ALTER TABLE producte ADD COLUMN tipus TEXT NOT NULL DEFAULT 'simple' CHECK (tipus IN ('simple', 'variable'));

-- Backfill de tipus para los 111 producte ya existentes, desde el payload
-- crudo ya aterrizado (ADR-003: no hace falta volver a pegarle a la API).
-- WooCommerce admite además 'grouped'/'external', que acá no aplican — caen
-- a 'simple' en vez de violar el CHECK de arriba (mismo criterio que
-- tipusNet() en transform/cataleg.ts).
UPDATE producte p
SET tipus = CASE WHEN aw.payload ->> 'type' = 'variable' THEN 'variable' ELSE 'simple' END
FROM alias_producte a
JOIN aterratge_woocommerce aw ON aw.recurs = 'products' AND aw.woo_id = a.woo_product_id
WHERE a.producte_id = p.id AND a.woo_variation_id = 0;

-- ── tarifa_preu ──────────────────────────────────────────────────────────
-- La matriz de precios (GET /tarifes/matriu) es tarifa × producte — no
-- existía ninguna tabla para esto, "tarifa" sólo tenía un importe genérico
-- sin usar. Sin fila = ese producto no tiene precio en esa tarifa (null en
-- la matriz), no es un error.
CREATE TABLE IF NOT EXISTS tarifa_preu (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_id       UUID NOT NULL REFERENCES tarifa (id),
  producte_id     UUID NOT NULL REFERENCES producte (id),
  preu            NUMERIC(10, 2) NOT NULL,
  creat_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualitzat_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tarifa_id, producte_id)
);
CREATE INDEX IF NOT EXISTS idx_tarifa_preu_producte_id ON tarifa_preu (producte_id);

-- ── client ───────────────────────────────────────────────────────────────
-- Campos que el contrato requiere y que la tabla nunca tuvo: la ingesta de
-- clientes desde WooCommerce todavía no existe (criterio de identificación
-- de cliente sin confirmar, ver CLAUDE.md) — estos campos quedan
-- disponibles para cuando se construya, y mientras tanto se completan a
-- mano vía PATCH /clients/:id.
ALTER TABLE client ADD COLUMN codi TEXT;
ALTER TABLE client ADD COLUMN nom TEXT;
ALTER TABLE client ADD COLUMN telefon TEXT;
ALTER TABLE client ADD COLUMN poblacio TEXT;
ALTER TABLE client ADD COLUMN tarifa_id UUID REFERENCES tarifa (id);
ALTER TABLE client ADD COLUMN transportista_defecte_id UUID REFERENCES transportista (id);
ALTER TABLE client ADD COLUMN actiu BOOLEAN NOT NULL DEFAULT true;

-- ── transportista ────────────────────────────────────────────────────────
ALTER TABLE transportista ADD COLUMN actiu BOOLEAN NOT NULL DEFAULT true;

-- ── comanda ──────────────────────────────────────────────────────────────
-- num: referencia legible para oficina/obrador ("2026-0142"). num_seq es un
-- contador global (no se reinicia por año — es una decisión deliberada, ver
-- ADR-019, más simple y sin condiciones de carrera que un contador anual).
--
-- No es GENERATED ALWAYS AS (...) STORED: to_char()/EXTRACT() sobre un
-- TIMESTAMPTZ dependen del huso horario de la sesión, así que Postgres los
-- considera STABLE, no IMMUTABLE — y una columna generada exige una
-- expresión inmutable. Un trigger BEFORE INSERT es el patrón estándar de
-- Postgres para este caso exacto.
ALTER TABLE comanda ADD COLUMN num_seq BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE comanda ADD COLUMN num TEXT;

CREATE OR REPLACE FUNCTION comanda_generar_num() RETURNS TRIGGER AS $$
BEGIN
  -- NEW.num_seq ya está resuelto acá: el DEFAULT de una columna IDENTITY se
  -- aplica antes de que corran los triggers BEFORE INSERT.
  NEW.num := to_char(NEW.creat_en, 'YYYY') || '-' || lpad(NEW.num_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comanda_generar_num
  BEFORE INSERT ON comanda
  FOR EACH ROW
  EXECUTE FUNCTION comanda_generar_num();

-- Backfill de los 4.250 pedidos ya existentes (num_seq ya se rellenó solo
-- al agregar la columna IDENTITY arriba; el trigger sólo corre en INSERTs
-- nuevos, así que estas filas necesitan la misma fórmula a mano).
UPDATE comanda
SET num = to_char(creat_en, 'YYYY') || '-' || lpad(num_seq::text, 4, '0')
WHERE num IS NULL;

ALTER TABLE comanda ALTER COLUMN num SET NOT NULL;

-- Bultos: propiedad del sistema (ADR-005), lo carga oficina — no existía
-- columna todavía.
ALTER TABLE comanda ADD COLUMN bultos INTEGER;

-- El contrato separa "observaciones de producción" (obrador) de
-- "observaciones de entrega" (transportista/cliente) — antes había una sola
-- columna genérica. Se renombra la que ya existía (mismo dato, mismo dueño:
-- el sistema, el sync nunca la toca) y se agrega la que faltaba.
ALTER TABLE comanda RENAME COLUMN observacions TO obs_produccio;
ALTER TABLE comanda ADD COLUMN obs_lliurament TEXT;

-- dataLliurament es el nombre del contrato; la columna se llamaba
-- data_entrega desde la capa 3, mismo campo.
ALTER TABLE comanda RENAME COLUMN data_entrega TO data_lliurament;

-- ── comanda_linia ────────────────────────────────────────────────────────
-- Observación de producción POR LÍNEA (ej. "Tallar fi") — no existía,
-- comanda.obs_produccio es a nivel de pedido completo.
ALTER TABLE comanda_linia ADD COLUMN obs_produccio TEXT;
