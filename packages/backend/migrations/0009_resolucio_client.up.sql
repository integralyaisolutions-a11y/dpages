-- ADR-020: resolverOCrearClient hace un upsert atómico (INSERT ... ON
-- CONFLICT) para resolver un cliente por NIF, luego por email — necesita
-- un índice único de verdad detrás, no el índice simple que había desde la
-- capa 3. Sin esto, dos pedidos del MISMO cliente nuevo procesados casi al
-- mismo tiempo (webhook + polling; no los serializa el lock de comanda,
-- que es por woo_order_id, no por cliente) podrían crear dos filas de
-- client duplicadas.
DROP INDEX IF EXISTS idx_client_nif;
CREATE UNIQUE INDEX idx_client_nif ON client (nif) WHERE nif IS NOT NULL;

DROP INDEX IF EXISTS idx_client_email;
CREATE UNIQUE INDEX idx_client_email ON client (email) WHERE email IS NOT NULL;
