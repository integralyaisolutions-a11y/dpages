CREATE TABLE IF NOT EXISTS client (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_customer_id   BIGINT,
  es_convidat       BOOLEAN NOT NULL DEFAULT false,
  -- Cobertura ~57% en los pedidos históricos; puede venir de dos campos
  -- distintos de WooCommerce que a veces discrepan (ver hallazgos).
  nif               TEXT,
  email             TEXT,
  creat_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_woo_customer_id
  ON client (woo_customer_id) WHERE woo_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_nif
  ON client (nif) WHERE nif IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_email
  ON client (email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS transportista (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom       TEXT NOT NULL,
  creat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Definición final (importe fijo, por franja...) pendiente de confirmar con
-- el cliente — ver "Pendientes de definición" en docs/contexto-negocio.md.
-- Tabla mínima para no bloquear el resto del modelo transaccional.
CREATE TABLE IF NOT EXISTS tarifa (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom       TEXT NOT NULL,
  import    NUMERIC(10,2),
  creat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comanda (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: 3 de los 4 canales (email, WhatsApp, teléfono) no pasan por
  -- WooCommerce y nunca van a tener woo_order_id.
  woo_order_id           BIGINT,
  origen                 TEXT NOT NULL CHECK (origen IN ('web', 'email', 'whatsapp', 'telefon')),
  estat                  TEXT NOT NULL DEFAULT 'oberta'
                           CHECK (estat IN ('oberta', 'en_proces', 'tancada', 'amb_incidencia')),
  -- Regla de congelación (ADR-007): NULL = no congelada. No NULL = momento
  -- en el que entró en producción y el sync dejó de sobrescribirla.
  congelat_a             TIMESTAMPTZ,
  client_id              UUID REFERENCES client (id),

  -- Propiedad de WooCommerce (ADR-005): el sync puede sobrescribir estas
  -- columnas mientras congelat_a sea NULL.
  poblacio_desti         TEXT,
  total                  NUMERIC(10,2),

  -- Propiedad del sistema (ADR-005): el sync nunca las toca.
  data_produccio         TIMESTAMPTZ,
  data_expedicio         TIMESTAMPTZ,
  data_entrega           TIMESTAMPTZ,
  transportista_id       UUID REFERENCES transportista (id),
  tarifa_id              UUID REFERENCES tarifa (id),
  observacions           TEXT,

  creat_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- date_modified_gmt de WooCommerce; guardián de versión (ADR-004). UTC
  -- sin excepción — TIMESTAMPTZ lo garantiza independientemente de la zona
  -- horaria de la sesión que escribe o lee (mezclar zonas es la causa
  -- número uno de registros perdidos en el sync).
  data_modificacio_woo   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comanda_woo_order_id
  ON comanda (woo_order_id) WHERE woo_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comanda_data_modificacio_woo
  ON comanda (data_modificacio_woo);
CREATE INDEX IF NOT EXISTS idx_comanda_estat
  ON comanda (estat);
CREATE INDEX IF NOT EXISTS idx_comanda_client_id
  ON comanda (client_id);
CREATE INDEX IF NOT EXISTS idx_comanda_transportista_id
  ON comanda (transportista_id);

CREATE TABLE IF NOT EXISTS comanda_linia (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id            UUID NOT NULL REFERENCES comanda (id) ON DELETE CASCADE,
  ordinal               INTEGER NOT NULL,
  -- Inestable: WooCommerce recrea los ids al editar un pedido desde el
  -- admin (ver ADR-006). Nunca usar como única clave de emparejamiento.
  woo_line_item_id      BIGINT,
  -- Artículo canónico: la referencia que importa para reportes/paneles
  -- (demanda agregada, filtros) sin importar en qué idioma se vendió.
  producte_id           UUID NOT NULL REFERENCES producte (id),
  -- Qué alias concreto (idioma/variación) resolvió esta línea, si vino de
  -- WooCommerce. Sólo trazabilidad.
  alias_producte_id     UUID REFERENCES alias_producte (id),

  -- Propiedad de WooCommerce
  unitats_demanades     INTEGER NOT NULL CHECK (unitats_demanades > 0),
  -- Sin IVA, tal como llega de WooCommerce. NUMERIC(10,2), nunca float.
  preu_unitari          NUMERIC(10,2) NOT NULL,

  -- Peso de ficha del artículo (NUMERIC(10,3), kg) en el momento de
  -- calcular la línea. NULL si el artículo es "a medida".
  pes_fitxa_kg          NUMERIC(10,3),
  -- unitats_demanades × pes_fitxa_kg, o el valor manual si es "a medida".
  -- Nunca se graba en cero (regla de negocio confirmada por el cliente).
  pes_calculat_kg       NUMERIC(10,3) NOT NULL CHECK (pes_calculat_kg > 0),
  pes_editable          BOOLEAN NOT NULL DEFAULT false,

  -- Propiedad del sistema — panel de empaquetado. Obligatorios, arrancan en
  -- 0 (0 sí es válido acá: es el estado ANTES de empaquetar), requieren
  -- checkbox de confirmación explícita aunque coincidan con lo pedido.
  unitats_lliurades     INTEGER NOT NULL DEFAULT 0,
  kg_lliurats           NUMERIC(10,3) NOT NULL DEFAULT 0,
  confirmat_empaquetat  BOOLEAN NOT NULL DEFAULT false,

  -- Borrado lógico (ADR-006): la línea ya no viene de WooCommerce, pero
  -- nunca se elimina físicamente porque borraría kilos/unidades ya
  -- registrados por empaquetado.
  esborrat              BOOLEAN NOT NULL DEFAULT false,

  creat_en              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comanda_linia_comanda_id
  ON comanda_linia (comanda_id);
CREATE INDEX IF NOT EXISTS idx_comanda_linia_comanda_woo_line_item
  ON comanda_linia (comanda_id, woo_line_item_id);
CREATE INDEX IF NOT EXISTS idx_comanda_linia_producte_id
  ON comanda_linia (producte_id);
