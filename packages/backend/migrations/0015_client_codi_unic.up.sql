-- Detectado en la capa 18 (importar-clients.ts): a diferencia de
-- producte.codi/tarifa.codi, client.codi no tenía ningún índice único —
-- el importador tuvo que resolver el upsert con un SELECT-then-INSERT/
-- UPDATE no atómico en vez de ON CONFLICT. Mismo patrón que los otros dos
-- (único sólo entre los que sí tienen valor — no todos los clientes lo
-- tienen cargado).
CREATE UNIQUE INDEX idx_client_codi ON client (codi) WHERE codi IS NOT NULL;
