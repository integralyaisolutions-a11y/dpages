-- Capa 14: mantenimientos nuevos que no existían todavía, sobre el contrato
-- v2 ya vigente en packages/shared (docs/contrato-api.md sección 4.2b).
-- Aditiva — no toca producte, categoria_producte ni comanda.

-- rendiments_porcs: ficha de rendimiento por producto (cuántas unidades
-- salen de un cerdo y cuánto pesa cada una), base del cálculo del Panell
-- Producció. agrupacio_rendiment, categoria y agrupacio_produccio NO se
-- guardan acá — se derivan de producte_id -> producte -> categoria_producte
-- al momento de leer, para no duplicar un dato que ya vive en el catálogo y
-- quedar desincronizados si el producto cambia de categoría. pes_total
-- tampoco se guarda: es unitats_per_porc * kg_per_unitat, calculado al leer.
CREATE TABLE rendiments_porcs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_seq        BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  producte_id   UUID NOT NULL REFERENCES producte(id),
  unitats_per_porc  NUMERIC(10,2) NOT NULL,
  kg_per_unitat     NUMERIC(10,3) NOT NULL,
  creat_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rendiments_porcs_producte_id ON rendiments_porcs(producte_id);
