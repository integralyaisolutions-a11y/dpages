-- ADR-018: bug real en la transformación de catálogo — creaba un `producte`
-- nuevo por cada producto de WooCommerce sin SKU, en vez de descartarlo y
-- registrar una incidencia (el mismo criterio que ya regía para líneas de
-- pedido sin artículo resuelto, pero nunca se había implementado en la
-- transformación de catálogo). El índice único de `codi` es parcial (WHERE
-- codi IS NOT NULL), así que ninguna de esas filas colisionaba entre sí:
-- cada producto de WooCommerce sin SKU terminó con su propio `producte`
-- fantasma (33 en la base de desarrollo al momento de escribir esto), y
-- 2.534 líneas de 2.053 pedidos "resolvieron" contra esos fantasmas vía el
-- alias que el mismo bug creó.

-- Incidencias de catálogo: mismo patrón que incidencia_comanda, pero sin
-- comanda de por medio — la referencia es al producto de WooCommerce
-- (woo_product_id), no a un producte propio, porque justamente no se crea
-- ninguno.
CREATE TABLE IF NOT EXISTS incidencia_cataleg (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_product_id  BIGINT NOT NULL,
  tipus           TEXT NOT NULL,
  detall          TEXT NOT NULL,
  creat_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolta         BOOLEAN NOT NULL DEFAULT false,
  resolta_en      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidencia_cataleg_woo_product_id
  ON incidencia_cataleg (woo_product_id);

-- Como máximo una incidencia SIN resolver por producto: transformarCataleg
-- corre en cada ciclo de sync y no debe acumular una fila nueva por corrida
-- mientras el producto siga sin SKU.
CREATE UNIQUE INDEX IF NOT EXISTS idx_incidencia_cataleg_no_resolta
  ON incidencia_cataleg (woo_product_id) WHERE NOT resolta;

-- Paso 1: registrar la incidencia de catálogo por cada producto fantasma —
-- para no perder el rastro de qué productos de WooCommerce quedaron sin
-- resolver una vez que se borren los producte de abajo.
INSERT INTO incidencia_cataleg (woo_product_id, tipus, detall)
SELECT a.woo_product_id, 'article_sense_sku',
       'Producte fantasma creat pel bug de la transformació de catàleg (sense SKU). ' ||
       'Migració 0007: l''article queda sense resoldre fins que tingui codi a WooCommerce.'
FROM alias_producte a
JOIN producte p ON p.id = a.producte_id
WHERE p.codi IS NULL;

-- Paso 2: registrar la incidencia en cada pedido con al menos una línea
-- "resuelta" contra un producte fantasma — ANTES de tocar comanda_linia,
-- porque esta consulta depende de que producte_id todavía apunte al
-- fantasma. Mismo criterio que transformarComanda usa para
-- 'article_no_resolt'.
INSERT INTO incidencia_comanda (comanda_id, tipus, detall)
SELECT DISTINCT cl.comanda_id, 'article_no_resolt',
       'Migració 0007: la línia havia "resolt" contra un producte fantasma creat ' ||
       'pel bug de codi buit a la transformació de catàleg — torna a l''estat sense resoldre.'
FROM comanda_linia cl
JOIN producte p ON p.id = cl.producte_id
WHERE p.codi IS NULL;

-- Paso 3: esos pedidos pasan a 'amb_incidencia' — igual que si nunca
-- hubieran resuelto el artículo. Mismo criterio, misma consulta que el
-- paso anterior (todavía antes de nulear producte_id).
UPDATE comanda SET estat = 'amb_incidencia'
WHERE id IN (
  SELECT DISTINCT cl.comanda_id
  FROM comanda_linia cl
  JOIN producte p ON p.id = cl.producte_id
  WHERE p.codi IS NULL
);

-- Paso 4: las líneas afectadas vuelven al estado correcto (sin resolver).
-- La traza cruda de WooCommerce en la línea (woo_product_id/
-- woo_variation_id/woo_sku) no se toca — sigue permitiendo resolver a mano
-- más adelante sin volver a pegarle a la API (ADR-003).
UPDATE comanda_linia
SET producte_id = NULL, alias_producte_id = NULL
WHERE producte_id IN (SELECT id FROM producte WHERE codi IS NULL);

-- Paso 5: recién ahora, sin nada que los referencie, se borran los alias
-- huérfanos y los producte fantasma.
DELETE FROM alias_producte WHERE producte_id IN (SELECT id FROM producte WHERE codi IS NULL);
DELETE FROM producte WHERE codi IS NULL;
