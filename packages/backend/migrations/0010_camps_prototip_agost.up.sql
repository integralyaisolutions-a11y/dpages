-- Capa 11: huecos encontrados comparando el contrato contra el prototipo
-- real que el cliente actualizó (capturas de /pedidos, /pedidos/nuevo,
-- /tarifes, /tarifes-llistat). Nada de esto toca agrupación de catálogo
-- (formato, envasat, agrupació producció) — eso se define en la reunión
-- con el cliente y es una capa aparte.

-- El prototipo muestra data de producció editable POR LÍNEA, distinta de
-- comanda.data_produccio (a nivel de cabecera). obs_produccio ya existe en
-- comanda_linia desde la migración 0008 — sólo faltaba esta.
ALTER TABLE comanda_linia ADD COLUMN data_produccio TIMESTAMPTZ;

-- Dirección de entrega en texto libre, separada de poblacio_desti (que es
-- sólo la población/ciudad, no la dirección completa).
ALTER TABLE comanda ADD COLUMN adreca_lliurament TEXT;

-- El prototipo tiene Código y Nombre como campos separados al crear una
-- tarifa. Único cuando no es null (mismo patrón que producte.codi,
-- client.nif, client.email) — nullable porque todavía no hay ninguna
-- tarifa real con código cargado.
ALTER TABLE tarifa ADD COLUMN codi TEXT;
CREATE UNIQUE INDEX idx_tarifa_codi ON tarifa (codi) WHERE codi IS NOT NULL;
