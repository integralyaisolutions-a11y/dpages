DROP INDEX IF EXISTS idx_client_email;
CREATE INDEX idx_client_email ON client (email) WHERE email IS NOT NULL;

DROP INDEX IF EXISTS idx_client_nif;
CREATE INDEX idx_client_nif ON client (nif) WHERE nif IS NOT NULL;
