-- Reversión BEST-EFFORT, NO 100% sin pérdida de información: el .up soltó
-- producte_id, así que ya no hay forma de saber a qué producto PUNTUAL
-- apuntaba originalmente cada fila dentro de su grupo (categoria_id +
-- agrupacio_produccio puede corresponder a varios productos reales). Este
-- down reasigna cada fila al producto de menor id_seq del grupo — mismo
-- criterio de desempate que usaba panells.ts antes de esta migración —
-- sólo para dejar el esquema en un estado válido, no para reconstruir el
-- dato original.

ALTER TABLE rendiments_porcs DROP CONSTRAINT rendiments_porcs_categoria_agrupacio_unique;

ALTER TABLE rendiments_porcs ADD COLUMN producte_id UUID REFERENCES producte(id);

UPDATE rendiments_porcs r
SET producte_id = (
  SELECT p.id FROM producte p
  WHERE p.categoria_id = r.categoria_id AND p.agrupacio_produccio = r.agrupacio_produccio
  ORDER BY p.id_seq ASC
  LIMIT 1
);

-- Si el catálogo cambió después de crear el rendiment (el producto que
-- originaba el grupo ya no existe, o cambió de categoria/agrupació), un
-- grupo puede quedar sin ningún producte real que lo respalde — producte_id
-- queda NULL en esos casos, y el SET NOT NULL de abajo falla ahí: es la
-- consecuencia esperada de un down best-effort, no un bug de esta
-- migración. Revisar a mano cuáles quedaron así antes de reintentar.
ALTER TABLE rendiments_porcs ALTER COLUMN producte_id SET NOT NULL;

CREATE INDEX idx_rendiments_porcs_producte_id ON rendiments_porcs(producte_id);

ALTER TABLE rendiments_porcs DROP COLUMN categoria_id;
ALTER TABLE rendiments_porcs DROP COLUMN agrupacio_produccio;
