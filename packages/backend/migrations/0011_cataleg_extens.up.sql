-- Capa 13: pone el backend al día con el contrato v2 confirmado con el
-- cliente el 18/08/2026 (ver docs/contrato-api.md secciones 4.1, 4.2 y
-- 4.11). Aditiva — no rompe nada de lo desplegado. Cubre producte,
-- categoria_producte y transportista, y de paso crea origen_comanda (ver
-- nota más abajo).

-- Los tres campos que el prototipo pide como editables por artículo,
-- confirmados el 18/08/2026 (docs/contrato-api.md sección 4.2).
ALTER TABLE producte ADD COLUMN agrupacio_produccio TEXT;
ALTER TABLE producte ADD COLUMN format TEXT
  CHECK (format IN ('SENCER', 'TALLAT', 'LLESCAT'));
ALTER TABLE producte ADD COLUMN envasat TEXT
  CHECK (envasat IN ('NORMAL', 'NORMAL (pes)', 'NORMAL (web)', 'ESPECIAL'));

-- agrupacio_rendiment ya existía desde la migración 0008 como TEXT libre,
-- sin restricción — ahora que el cliente confirmó los tres valores válidos
-- (docs/contrato-api.md sección 4.1), se cierra con un CHECK. No se toca
-- la columna en sí, sólo se agrega la validación. Si algún ambiente ya
-- tiene una fila con un valor fuera de estos tres, esta ALTER va a fallar
-- al aplicarse — es intencional (mejor fallar acá que dejar pasar un dato
-- inválido).
ALTER TABLE categoria_producte ADD CONSTRAINT categoria_producte_agrupacio_rendiment_check
  CHECK (agrupacio_rendiment IN ('KG', 'MAGRE', 'PAQ') OR agrupacio_rendiment IS NULL);

-- Mismo patrón que producte.codi/tarifa.codi (migraciones 0002/0010):
-- texto libre, único sólo entre los que sí tienen valor — no todos los
-- transportistas lo van a tener al principio.
ALTER TABLE transportista ADD COLUMN codi TEXT;
CREATE UNIQUE INDEX idx_transportista_codi ON transportista (codi) WHERE codi IS NOT NULL;

-- origen_comanda: todavía no existía ninguna migración para esta tabla
-- (docs/contrato-api.md sección 4.11 ya la documenta como CRUD, pero ese
-- CRUD real es capa 15, junto con el resto de comanda/Obrador). Se crea
-- acá, adelantada, porque hace falta para poder sembrar sus dos filas
-- iniciales (packages/backend/src/scripts/seed-arranque.ts) — mismo
-- criterio de columnas que el resto de las tablas expuestas por API
-- (id_seq de sólo lectura para el contrato, ver ADR-019).
CREATE TABLE IF NOT EXISTS origen_comanda (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_seq    BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  codi      TEXT NOT NULL UNIQUE,
  nom       TEXT NOT NULL,
  actiu     BOOLEAN NOT NULL DEFAULT true,
  creat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
