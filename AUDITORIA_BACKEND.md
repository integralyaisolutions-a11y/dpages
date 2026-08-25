# Auditoría del backend de dPagès — estado actual

**Fecha**: 24 de agosto de 2026 · **Alcance**: `packages/backend/src` completo
(`http/`, `transform/`, `sync/`, `woocommerce/`, `db/`, `config/`), las 15
migraciones aplicadas, `packages/shared`, `docs/contrato-api.md`,
`docs/openapi.yaml`, `docs/decisiones-arquitectura.md` (ADR-001 a ADR-023) y
la infraestructura documentada en `docs/infraestructura-gcp-estado-16ago.md`.

Documento exclusivamente de inventario/documentación — no se modificó código
en esta pasada.

**Nota sobre `docs/especificacion-funcional-dpages.md`**: varios comentarios
del código (`rendiments-porcs.ts`, `panells.ts`) citan este archivo como
fuente de la "regla 3.1 transversal" (coincidencia exacta en búsquedas). El
archivo **no existe en el repositorio** — sólo se pudo verificar la regla
donde el código efectivamente la implementa, no contra ese documento.

**Nota sobre el "Anexo de Scope" (M1-M10)**: no existe ningún archivo con ese
nombre ni esa numeración en el repositorio. La organización real del proyecto
es por **capas** (numeradas 1 a 22 en comentarios de migraciones y ADRs) y,
para permisos, por **módulos** (`categories`, `catalog`, `tarifes`,
`tarifes-clients`, `comandes`, `rendiments-porcs`, `panell-oficina`,
`panell-obrador`, `panell-empaquetat`, `panell-produccio`, `usuaris`, `rols`
— la lista exacta que devuelve `GET /rols`). Uso esa columna de módulo en la
tabla de la sección 1 en vez de M1-M10.

---

## 1. Inventario de endpoints implementados

`docs/openapi.yaml` trae en su propia cabecera una advertencia que **ya no
es cierta**: dice que "los endpoints nuevos (rendiments-porcs, panells/
produccio, origens-comanda, usuaris, rols, jo) todavía no están implementados
en el backend real". Verificado contra el código: **todos están implementados
excepto `origens-comanda`**, que sigue siendo el único hueco real. Esa nota
de la cabecera del OpenAPI está desactualizada y debería corregirse.

| Método | Ruta | Entidad | Estado | Módulo |
|---|---|---|---|---|
| GET | `/salut` | — | Implementado y testeado | — (fuera de `/api/v1`) |
| POST | `/webhooks/woocommerce` | Comanda (notificación) | Implementado y testeado | — (mecanismo propio, HMAC) |
| POST | `/tasques/sync-comandes` | Comanda/Producte (sync) | Implementado y testeado | — (mecanismo propio, OIDC/secreto) |
| POST | `/tasques/sync-cataleg` | Producte (sync) | Implementado y testeado | — |
| POST | `/tasques/reconciliar` | Comanda/Producte (sync) | Implementado y testeado | — |
| GET | `/categories` | Categoria | Implementado y testeado | `categories` |
| POST | `/categories` | Categoria | Implementado y testeado | `categories` |
| PATCH | `/categories/:id` | Categoria | Implementado y testeado | `categories` |
| DELETE | `/categories/:id` | Categoria | Implementado y testeado (incl. borrado protegido 409) | `categories` |
| GET | `/productes` | Producte | Implementado y testeado (incl. `cerca`) | `catalog` |
| GET | `/productes/:id` | Producte | **Implementado, sin test dedicado** | `catalog` |
| POST | `/productes` | Producte | Implementado y testeado | `catalog` |
| PATCH | `/productes/:id` | Producte | Implementado y testeado | `catalog` |
| GET | `/rendiments-porcs` | RendimentPorc | Implementado y testeado | `rendiments-porcs` |
| POST | `/rendiments-porcs` | RendimentPorc | Implementado y testeado | `rendiments-porcs` |
| PATCH | `/rendiments-porcs/:id` | RendimentPorc | Implementado y testeado | `rendiments-porcs` |
| DELETE | `/rendiments-porcs/:id` | RendimentPorc | Implementado y testeado | `rendiments-porcs` |
| GET | `/tarifes/matriu` | Tarifa/Producte | Implementado y testeado | `tarifes` |
| POST | `/tarifes` | Tarifa | Implementado y testeado (incl. 409 por `codi` repetido) | `tarifes` |
| PATCH | `/tarifes/:tarifaId/preus/:producteId` | Tarifa_preu | Implementado y testeado | `tarifes` |
| GET | `/clients` | Client | Implementado y testeado | `tarifes-clients` |
| POST | `/clients` | Client | Implementado y testeado | `tarifes-clients` |
| PATCH | `/clients/:id` | Client | Implementado y testeado (parcial: no hay test que cubra `transportistaDefecteId` ni `actiu`) | `tarifes-clients` |
| GET | `/transportistes` | Transportista | **Implementado, testeado parcial** (un solo test, no cubre `codi`) | `tarifes-clients` |
| POST | `/transportistes` | Transportista | **Implementado, sin test** | `tarifes-clients` |
| PATCH | `/transportistes/:id` | Transportista | **Implementado, sin test** | `tarifes-clients` |
| GET | `/comandes` | Comanda | Implementado y testeado extensamente (filtros de fecha, `estat`, incidencias) | `comandes` |
| POST | `/comandes` | Comanda | Implementado y testeado (incl. cascada de precio) | `comandes` |
| GET | `/comandes/:id` | Comanda | Implementado y testeado | `comandes` |
| PATCH | `/comandes/:id` | Comanda | Implementado y testeado (incl. 409 congelada) | `comandes` |
| DELETE | `/comandes/:comandaId/linies/:liniaId` | ComandaLinia | Implementado y testeado (borrado lógico) | `comandes` |
| PATCH | `/comandes/:comandaId/linies/:liniaId/lliurament` | ComandaLinia | Implementado y testeado | `comandes` (empaquetat no es módulo propio — vive dentro de `comandes`) |
| GET | `/panells/oficina` | Comanda (agregado) | Implementado y testeado | `panell-oficina` |
| GET | `/panells/obrador` | ComandaLinia (individual) | Implementado y testeado (incl. filtros `producte`/`format`/`envasat`, capa 20) | `panell-obrador` |
| GET | `/panells/empaquetat` | ComandaLinia | Implementado y testeado | `panell-empaquetat` |
| GET | `/panells/produccio` | Agregado por `agrupacioProduccio` | Implementado y testeado extensamente (fórmulas KG/PAQ/MAGRE) | `panell-produccio` |
| GET | `/origens-comanda` | OrigenComanda | **Documentado en `contrato-api.md` §4.11 y `openapi.yaml` — NO implementado.** La tabla `origen_comanda` sí existe y está poblada (migración 0011); no hay ruta HTTP alguna. | — |
| POST | `/origens-comanda` | OrigenComanda | **Documentado, no implementado.** | — |
| PATCH | `/origens-comanda/:id` | OrigenComanda | **Documentado, no implementado.** | — |
| DELETE | `/origens-comanda/:id` | OrigenComanda | **Documentado, no implementado.** | — |
| GET | `/jo` | Usuari (autenticado) | Implementado y testeado | — (siempre accesible, es quien pregunta) |
| GET | `/usuaris` | Usuari | Implementado, testeado parcial (no hay test explícito del filtro `?actiu=`) | `usuaris` |
| POST | `/usuaris` | Usuari | Implementado y testeado extensamente (incl. rollback en Firebase si falla) | `usuaris` (además exige el módulo `usuaris` en el propio usuario que llama — ver sección 5) |
| PATCH | `/usuaris/:id` | Usuari | Implementado y testeado | — (no exige módulo `usuaris` hoy; ver hallazgo en sección 10) |
| GET | `/rols` | Rol | Implementado y testeado | `rols` |
| POST | `/rols` | Rol | Implementado y testeado | `rols` |
| PATCH | `/rols/:id` | Rol | Implementado y testeado | `rols` |
| DELETE | `/rols/:id` | Rol | No implementado — **documentado explícitamente como ausente a propósito** en `contrato-api.md` §4.12 (un rol en uso no se puede borrar sin dejar `usuari.rolId` sin valor). Coincide con la documentación, no es un gap real. | — |

**Resumen**: de los endpoints documentados en `contrato-api.md`/`openapi.yaml`,
**sólo el CRUD de `origens-comanda` (4 rutas) está documentado y no
implementado**. Todo lo demás — incluido todo lo que el propio `openapi.yaml`
advierte como "todavía no implementado" (rendiments-porcs, panells/produccio,
usuaris, rols, jo) — ya existe en el código y tiene test. El backend está,
en los hechos, más avanzado de lo que su propio `openapi.yaml` afirma.

---

## 2. Modelo de datos real (esquema tras las 15 migraciones)

### Tablas de infraestructura de sincronización

**`aterratge_woocommerce`** (ADR-003 — landing crudo)
```
recurs       TEXT NOT NULL
woo_id       BIGINT NOT NULL
payload      JSONB NOT NULL
capturat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (recurs, woo_id)
```

**`cursor_sincronitzacio`**
```
recurs                        TEXT PRIMARY KEY
cursor_en                     TIMESTAMPTZ  (nullable desde migración 0004)
actualitzat_en                TIMESTAMPTZ NOT NULL DEFAULT now()
ultim_error                   TEXT           (migración 0004)
ultim_error_en                TIMESTAMPTZ    (migración 0004)
intents_fallits_consecutius   INTEGER NOT NULL DEFAULT 0  (migración 0004)
```

**`esdeveniment_webhook`** (idempotencia/auditoría del webhook)
```
id                BIGSERIAL PRIMARY KEY
woo_order_id      BIGINT NOT NULL
topic             TEXT NOT NULL
signatura_valida  BOOLEAN NOT NULL
rebut_en          TIMESTAMPTZ NOT NULL DEFAULT now()
processat         BOOLEAN NOT NULL DEFAULT false
processat_en      TIMESTAMPTZ
error             TEXT
INDEX (woo_order_id)  -- SIN constraint único — ver sección 4
```

### Catálogo

**`producte`**
```
id                    UUID PRIMARY KEY DEFAULT gen_random_uuid()
codi                  TEXT                          -- único parcial (WHERE codi IS NOT NULL)
descripcio            TEXT NOT NULL                 -- renombrada de "nom" (migración 0008)
descripcio_venda      TEXT
pes_kg                NUMERIC(10,3)                 -- null = artículo "a medida"
actiu                 BOOLEAN NOT NULL DEFAULT true
creat_en              TIMESTAMPTZ NOT NULL DEFAULT now()
categoria_id          UUID REFERENCES categoria_producte(id)
tipus                 TEXT NOT NULL DEFAULT 'simple' CHECK (tipus IN ('simple','variable'))
preu_venda            NUMERIC(10,2)
id_seq                BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
agrupacio_produccio   TEXT                          -- migración 0011, texto libre
format                TEXT CHECK (format IN ('SENCER','TALLAT','LLESCAT'))       -- migración 0011
envasat               TEXT CHECK (envasat IN ('NORMAL','NORMAL (pes)','NORMAL (web)','ESPECIAL'))  -- migración 0011
```

**`alias_producte`** (ADR-008 — catálogo duplicado por idioma)
```
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
producte_id       UUID NOT NULL REFERENCES producte(id)
woo_product_id    BIGINT NOT NULL
woo_variation_id  BIGINT NOT NULL DEFAULT 0    -- 0 = el producto en sí, no una variación
idioma            TEXT NOT NULL CHECK (idioma IN ('ca','es'))
codi              TEXT
creat_en          TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (woo_product_id, woo_variation_id)
```

**`categoria_producte`**
```
id                    UUID PRIMARY KEY DEFAULT gen_random_uuid()
nom                   TEXT NOT NULL UNIQUE
creat_en              TIMESTAMPTZ NOT NULL DEFAULT now()
id_seq                BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
elaborat_porc         BOOLEAN NOT NULL DEFAULT false
agrupacio_rendiment   TEXT CHECK (agrupacio_rendiment IN ('KG','MAGRE','PAQ') OR agrupacio_rendiment IS NULL)  -- CHECK cerrado en migración 0011
```

### Comercial

**`client`**
```
id                          UUID PRIMARY KEY DEFAULT gen_random_uuid()
woo_customer_id             BIGINT                  -- único parcial
es_convidat                 BOOLEAN NOT NULL DEFAULT false
nif                         TEXT                    -- único parcial (ADR-020)
email                       TEXT                    -- único parcial (ADR-020)
creat_en                    TIMESTAMPTZ NOT NULL DEFAULT now()
id_seq                      BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
codi                        TEXT                    -- único parcial (migración 0015)
nom                         TEXT
telefon                     TEXT
poblacio                    TEXT
tarifa_id                   UUID REFERENCES tarifa(id)
transportista_defecte_id    UUID REFERENCES transportista(id)   -- ver sección 3
actiu                       BOOLEAN NOT NULL DEFAULT true
```

**`transportista`**
```
id        UUID PRIMARY KEY DEFAULT gen_random_uuid()
nom       TEXT NOT NULL
creat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
id_seq    BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
actiu     BOOLEAN NOT NULL DEFAULT true
codi      TEXT   -- único parcial, texto libre nemotécnico (migración 0011)
```

**`tarifa`**
```
id        UUID PRIMARY KEY DEFAULT gen_random_uuid()
nom       TEXT NOT NULL
import    NUMERIC(10,2)   -- legado de la capa 3, sin uso real hoy
creat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
id_seq    BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
codi      TEXT   -- único parcial (migración 0010)
```

**`tarifa_preu`**
```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tarifa_id       UUID NOT NULL REFERENCES tarifa(id)
producte_id     UUID NOT NULL REFERENCES producte(id)
preu            NUMERIC(10,2) NOT NULL
creat_en        TIMESTAMPTZ NOT NULL DEFAULT now()
actualitzat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (tarifa_id, producte_id)
```

**`origen_comanda`** (migración 0011 — ver sección 3)
```
id        UUID PRIMARY KEY DEFAULT gen_random_uuid()
id_seq    BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
codi      TEXT NOT NULL UNIQUE
nom       TEXT NOT NULL
actiu     BOOLEAN NOT NULL DEFAULT true
creat_en  TIMESTAMPTZ NOT NULL DEFAULT now()
```
Sembrada con dos filas (`woocommerce`/`WooCommerce`, `manual`/`Manual`) por
`scripts/seed-arranque.ts`.

### Pedidos

**`comanda`**
```
id                    UUID PRIMARY KEY DEFAULT gen_random_uuid()
woo_order_id          BIGINT             -- único parcial; null = capturado a mano
origen                TEXT               -- DEPRECATED (migración 0013): ya no se lee ni se escribe, nullable, sin CHECK
estat                 TEXT NOT NULL DEFAULT 'oberta' CHECK (estat IN ('oberta','en_proces','tancada','amb_incidencia'))
congelat_a            TIMESTAMPTZ        -- ADR-007
client_id             UUID REFERENCES client(id)
poblacio_desti        TEXT
total                 NUMERIC(10,2)
data_produccio        TIMESTAMPTZ
data_expedicio        TIMESTAMPTZ
data_lliurament       TIMESTAMPTZ        -- renombrada de data_entrega (migración 0008)
transportista_id      UUID REFERENCES transportista(id)
tarifa_id             UUID REFERENCES tarifa(id)
obs_produccio         TEXT               -- renombrada de observacions (migración 0008)
creat_en              TIMESTAMPTZ NOT NULL DEFAULT now()
data_modificacio_woo  TIMESTAMPTZ        -- guardián de versión, ADR-004
id_seq                BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
num_seq               BIGINT GENERATED ALWAYS AS IDENTITY
num                   TEXT NOT NULL      -- trigger BEFORE INSERT; formato "NNNNNN" (6 dígitos) desde migración 0013 (antes "AAAA-NNNN")
bultos                INTEGER
obs_lliurament        TEXT
adreca_lliurament     TEXT               -- migración 0010
origen_id             UUID NOT NULL REFERENCES origen_comanda(id)   -- migración 0013, reemplaza a "origen"
```

**`comanda_linia`**
```
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
comanda_id          UUID NOT NULL REFERENCES comanda(id) ON DELETE CASCADE
ordinal             INTEGER NOT NULL
woo_line_item_id    BIGINT             -- inestable, ADR-006
producte_id         UUID REFERENCES producte(id)      -- nullable desde migración 0005
alias_producte_id   UUID REFERENCES alias_producte(id)
unitats_demanades   INTEGER NOT NULL CHECK (unitats_demanades > 0)
preu_unitari        NUMERIC(10,2) NOT NULL
pes_fitxa_kg        NUMERIC(10,3)
pes_calculat_kg     NUMERIC(10,3) NOT NULL CHECK (pes_calculat_kg >= 0)   -- relajado de ">0" a ">=0" en migración 0005
pes_editable        BOOLEAN NOT NULL DEFAULT false
unitats_lliurades   INTEGER NOT NULL DEFAULT 0
kg_lliurats         NUMERIC(10,3) NOT NULL DEFAULT 0
esborrat            BOOLEAN NOT NULL DEFAULT false     -- ADR-006, borrado lógico
creat_en            TIMESTAMPTZ NOT NULL DEFAULT now()
id_seq              BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
confirmat_a         TIMESTAMPTZ         -- migración 0006, reemplaza confirmat_empaquetat BOOLEAN
confirmat_per       TEXT                -- uid de Firebase (texto libre, NO es FK a usuari — ver sección 10)
obs_produccio       TEXT                -- migración 0008
woo_product_id      BIGINT              -- migración 0005, traza cruda
woo_variation_id    BIGINT              -- migración 0005
woo_sku             TEXT                -- migración 0005
data_produccio      TIMESTAMPTZ         -- migración 0010, propia de la línea
```

### Incidencias

**`incidencia_comanda`**
```
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
comanda_id  UUID NOT NULL REFERENCES comanda(id) ON DELETE CASCADE
tipus       TEXT NOT NULL     -- texto libre; valores vistos hoy: article_no_resolt,
                              -- conflicte_identitat_client, sense_dades_client, sense_preu (nuevo, capa 15)
detall      TEXT NOT NULL
creat_en    TIMESTAMPTZ NOT NULL DEFAULT now()
resolta     BOOLEAN NOT NULL DEFAULT false
resolta_en  TIMESTAMPTZ
```

**`incidencia_cataleg`** (mismo patrón, sin `comanda_id` — referencia a `woo_product_id`)
```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
woo_product_id  BIGINT NOT NULL
tipus           TEXT NOT NULL     -- article_sense_sku
detall          TEXT NOT NULL
creat_en        TIMESTAMPTZ NOT NULL DEFAULT now()
resolta         BOOLEAN NOT NULL DEFAULT false
resolta_en      TIMESTAMPTZ
UNIQUE (woo_product_id) WHERE NOT resolta
```

### Producción porcina (capa 14/16/17)

**`rendiments_porcs`**
```
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
id_seq            BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
producte_id       UUID NOT NULL REFERENCES producte(id)
unitats_per_porc  NUMERIC(10,2) NOT NULL
kg_per_unitat     NUMERIC(10,3) NOT NULL
creat_en          TIMESTAMPTZ NOT NULL DEFAULT now()
```
`agrupacioRendiment`/`categoria`/`agrupacioProduccio`/`pesTotal` de la API
**no se guardan acá** — se derivan en cada lectura desde `producte` →
`categoria_producte`, para no duplicar un dato que puede cambiar.

### Usuarios y roles (capa 17)

**`rol`**
```
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
id_seq           BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
nom              TEXT NOT NULL UNIQUE
moduls_permesos  TEXT[] NOT NULL DEFAULT '{}'
creat_en         TIMESTAMPTZ NOT NULL DEFAULT now()
```
Sembrada en la propia migración (no en `seed-arranque.ts`) con
`Administrador` (todos los módulos) y `General` (todos salvo `usuaris`/`rols`).

**`usuari`**
```
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
id_seq         BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
firebase_uid   TEXT NOT NULL UNIQUE
nom            TEXT NOT NULL
email          TEXT NOT NULL
rol_id         UUID NOT NULL REFERENCES rol(id)
actiu          BOOLEAN NOT NULL DEFAULT true
creat_en       TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## 3. Los 4 puntos calientes — estado real del backend

### B1 — Panell Obrador: ¿agrupado o líneas individuales?

**Líneas individuales — confirmado en el código.** `panells.ts`, handler de
`GET /panells/obrador` (línea 188 en adelante): la consulta hace
`SELECT ... FROM comanda_linia cl JOIN comanda c ... JOIN producte p ...`
sin ningún `GROUP BY` — cada fila devuelta es exactamente una
`comanda_linia`, con `liniaId`/`comandaId` propios. El comentario en el
propio archivo lo dice explícito: *"líneas de pedido individuales, no
agregado"*. Test dedicado: `panells.test.ts` línea 119, *"GET /panells/
obrador: líneas de pedido individuales (liniaId/comandaId/client reales, no
agregado)"*.

Coincide exactamente con lo que documenta `contrato-api.md` §4.7 (*"ya NO es
'agrupado por producto'... cada fila es una línea real de un pedido real"*)
y con lo que Francesc pidió, según quedó registrado en la auditoría de
backend anterior. **Este punto ya está resuelto, no es un hallazgo
pendiente.**

### `transportistaDefecte`

**La columna existe** (`client.transportista_defecte_id`, FK a
`transportista`, desde la migración 0008) **y sigue sin autocompletarse en
ningún lado.** Verificado en `comandes.ts`, handler de `POST /comandes`: el
`transportistaId` del pedido nuevo se toma directo del cuerpo de la
petición (`cos.transportistaId`) — en ningún punto del handler se lee
`client.transportista_defecte_id` para rellenarlo. El único lugar que toca
esta columna es `PATCH /clients/:id` (`clients.ts`, línea 195 en adelante),
que la deja setear a mano.

Es decir: el campo sigue existiendo en base y en el contrato
(`ClientApi.transportistaDefecte`), pero es y sigue siendo un dato manual
sin ningún efecto automático sobre pedidos nuevos. Sin cambios respecto a
lo encontrado en la auditoría anterior.

### `OrigenComanda`

**Ya migró de enum fijo a tabla mantenible — confirmado en el código, no
sólo en el contrato.** Cambios reales, todos verificados:

1. `origen_comanda` existe como tabla (migración 0011, sección 2 arriba).
2. `comanda.origen_id` es FK **NOT NULL** a `origen_comanda` desde la
   migración 0013 — reemplazó por completo al criterio anterior.
3. La columna vieja `comanda.origen` (el enum de texto libre
   `'web'|'email'|'whatsapp'|'telefon'`) sigue existiendo en la tabla pero
   está **oficialmente deprecated** (`COMMENT ON COLUMN`, migración 0013):
   *"No se lee ni se escribe desde el código nuevo"* — confirmado: ningún
   `SELECT`/`INSERT`/`UPDATE` del código actual la toca. Su `CHECK` viejo se
   eliminó y quedó nullable.
4. `POST /comandes` (`comandes.ts`, línea ~404) resuelve el `origen` del
   cuerpo de la petición contra `origen_comanda.codi` (`SELECT id FROM
   origen_comanda WHERE codi = $1`) — si no existe ese código, `400
   VALIDACIO`. `GET /comandes` filtra con `oc.codi = $1` (exacto, no
   parcial).
5. Hoy existen exactamente **2 valores sembrados**: `woocommerce` y
   `manual` (backfill de los pedidos existentes hecho por
   `woo_order_id IS NOT NULL`/`IS NULL` respectivamente, migración 0013) —
   coincide con lo que pidió Francesc.

**Lo único que falta**: el CRUD de `/origens-comanda` que el contrato
documenta (sección 1 de este informe) — la tabla y la FK ya están listas
para consumirse, pero no hay manera de listar/crear/editar orígenes vía
API todavía. Es el gap más concreto y accionable de todo este documento.

### Búsqueda (`?cerca=`) — inconsistente entre endpoints, confirmado

**No es uniforme.** Hay dos criterios conviviendo en el mismo backend,
según cuándo se escribió cada endpoint:

| Endpoint | Parámetro | Implementación real | Tipo |
|---|---|---|---|
| `GET /productes` | `cerca` | `descripcio ILIKE '%...%' OR descripcio_venda ILIKE '%...%' OR codi ILIKE '%...%'` | **Parcial** |
| `GET /tarifes/matriu` | `cerca` | `descripcio ILIKE '%...%' OR codi ILIKE '%...%'` | **Parcial** |
| `GET /clients` | `cerca` | `nom ILIKE '%...%' OR codi ILIKE '%...%'` | **Parcial** |
| `GET /comandes` | `cerca` | `num ILIKE '%...%'` | **Parcial** |
| `GET /rendiments-porcs` | `producte` | `LOWER(descripcio) = LOWER($1)` | **Exacta** (case-insensitive) |
| `GET /panells/obrador` | `producte` | `LOWER(descripcio) = LOWER($1)` | **Exacta** (case-insensitive) |
| `GET /panells/produccio` | `producte` | `LOWER(descripcio) = LOWER($1)` | **Exacta** (case-insensitive) |

Los tres endpoints nuevos (capas 14/16/20) implementan correctamente la
"regla 3.1" que sus propios comentarios citan (*"'lomo' no debe traer
'cabeza de lomo'"*) — pero los cuatro endpoints más viejos
(`productes`/`tarifes`/`clients`/`comandes`) siguen con `ILIKE '%...%'`
parcial, sin que nadie los haya vuelto a tocar. **No hay ninguna
inconsistencia de contrato** (el contrato nunca prometió un criterio
único para `cerca` vs. `producte`/`categoria`/etc.), pero si la intención
real es que toda búsqueda del sistema sea exacta, faltan cuatro endpoints
por corregir — y el parámetro se llama distinto en cada grupo (`cerca` en
los viejos, `producte`/`categoria`/`agrupacioProduccio` en los nuevos), lo
que sugiere que el criterio "exacto" se adoptó como norma nueva sin
revisitar lo ya construido.

---

## 4. Integración WooCommerce

### Estado del webhook

**Implementado y testeado contra Postgres real** (`webhook.test.ts`, con
`fetch` interceptado — nunca pega a un WooCommerce real en los tests). No
hay evidencia en el repositorio de que se haya probado contra pedidos
**reales** de producción vía el webhook desplegado — el propio
`infraestructura-gcp-estado-16ago.md` (fechado 17/08) dice que Cloud Run
sigue sin arrancar por falta de permisos IAM (sección 8 de este informe),
así que un webhook real de `dpages.cat` apuntando a la URL de Cloud Run no
puede haber llegado todavía a un servicio funcionando. Lo que sí está
verificado end-to-end: firma HMAC-SHA256 válida/inválida, registro del
evento, respuesta rápida (200 antes de procesar en segundo plano,
verificado con un límite de tiempo en el test), y que el trabajo de fondo
efectivamente crea la `comanda` y marca el evento como procesado.

### Idempotencia por `order_id`

**Parcial, y vale la pena precisar exactamente en qué sentido.**
`esdeveniment_webhook` **no tiene ningún constraint único sobre
`woo_order_id`** — cada entrega del webhook (incluidos reintentos de
WooCommerce) inserta una fila nueva en esa tabla, a propósito: es un log de
auditoría, no un candado. La idempotencia real está un nivel más abajo, en
`transformarComanda` (ADR-002/004/016):

1. **Guardián de versión** (ADR-004): el `UPDATE` de cabecera sólo aplica
   si `date_modified_gmt` entrante es mayor que el almacenado — un webhook
   duplicado o fuera de orden no puede pisar un estado más nuevo.
2. **Lock de concurrencia** (ADR-016): `pg_advisory_xact_lock(woo_order_id)`
   serializa el procesamiento del mismo pedido, así que un webhook y un
   ciclo de polling casi simultáneos para el mismo pedido no compiten.

No hay un test que dispare el mismo `woo_order_id` dos veces **a través del
webhook** para confirmar que el segundo procesamiento es un no-op limpio
(los tests de idempotencia que sí existen — `comandes.test.ts`, `webhook.test.ts` —
verifican firma/registro/transformación por separado, no un webhook
duplicado end-to-end). El mecanismo está ahí y es sólido en diseño, pero
esa combinación específica no tiene un test dedicado.

### Normalización del payload — mapeo campo por campo

Confirmado en `transform/cataleg.ts` y `transform/comandes.ts` (esta
última no se releyó completa en esta pasada, pero sí `resolucio-article.ts`
y el `INSERT` de cabecera de comanda):

| Campo WooCommerce | Campo interno | Transformación |
|---|---|---|
| `product.sku` | `producte.codi` | Trim; vacío/ausente → `null` (nunca `''`) |
| `product.name` | `producte.descripcio` | Directo, sin transformar |
| `product.status === 'publish'` | `producte.actiu` | Booleano derivado |
| `product.type` | `producte.tipus` | `'variable'` se mapea igual; cualquier otro valor (incluidos `grouped`/`external` de WooCommerce) cae a `'simple'` |
| `product.categories[0].name` | `categoria_producte.nom` | Sólo la PRIMERA categoría del payload; se resuelve a un nombre canónico (`resolverNomCategoriaCanonic`) para que "Fresc"/"Fresco" no creen dos categorías |
| `order.status` | `comanda.estat_web` | Directo (campo crudo, distinto de `comanda.estat`, el flujo propio) |
| `order.date_modified_gmt` | `comanda.data_modificacio_woo` | Parseado como UTC explícito (`parsearFechaGmt`) — guardián de versión |
| `order.total` | `comanda.total` | Directo, ya viene sin IVA según `hallazgos-woocommerce.md` |
| `order.shipping.city` | `comanda.poblacio_desti` | Directo |
| `line_item.quantity` | `comanda_linia.unitats_demanades` | Directo |
| `line_item.price` | `comanda_linia.preu_unitari` | Directo, sin IVA |

### Resolución de SKU WooCommerce → artículo interno

`transform/resolucio-article.ts`, función `resolverArticle` — orden exacto
(ADR-008), confirmado en el código:

1. **Alias exacto** por `(woo_product_id, woo_variation_id)`.
2. Si es una variación (`woo_variation_id !== 0`) sin alias propio, cae al
   **alias del producto padre** (`woo_variation_id = 0`) — cubre el caso de
   que la ingesta de variaciones todavía no exista.
3. Si nada de lo anterior matchea, **por código de artículo** (`SKU` de la
   línea) contra `producte.codi`.
4. **Sin resolver**: devuelve `null`. El llamador (`transformarComanda`,
   capa 6) **no descarta la línea** — la guarda con `producte_id = NULL`,
   guarda la traza cruda (`woo_product_id`/`woo_variation_id`/`woo_sku`) y
   registra una incidencia `article_no_resolt`. Mismo criterio aplicado en
   el catálogo (`transform/cataleg.ts`, `obtenirOCrearArticle`): un
   producto de WooCommerce sin SKU **nunca crea un `producte` nuevo** —
   incidencia `article_sense_sku` y sigue con el siguiente (ADR-018).

---

## 5. Autenticación y roles

**Firebase Auth está configurado en el proyecto GCP** según
`infraestructura-gcp-estado-16ago.md` (Email/contraseña habilitado, app web
`dpages-frontend` registrada, proyecto vinculado `dpages-be46b`) — pero ese
documento tiene fecha **17 de agosto**, y hoy (24 de agosto) no hay ningún
documento más reciente que confirme si sigue en el mismo estado. Ver
sección 8 para el detalle de qué seguía pendiente en esa fecha.

### Los "roles" son en realidad dos mecanismos distintos que conviven

Esto es un hallazgo en sí mismo, no documentado en ningún ADR:

1. **`req.usuari.rol`** (`auth-firebase.ts`): un **custom claim de Firebase**
   (`rol`, string o `null`), leído directo del token verificado. El propio
   comentario del código dice qué es: *"decisión de VisioFlow, no del
   cliente... esto es sólo para auditoría — no para autorización"*. Este es
   el mecanismo que describe ADR-021.
2. **`req.usuariResolt.rol`** (`resoldre-usuari.ts`): el rol real del
   sistema, resuelto contra las tablas `usuari`/`rol` de Postgres (capa 17,
   posterior a ADR-021) por `firebase_uid` — **no** por ningún custom
   claim. Es este segundo mecanismo el que efectivamente decide
   `modulsPermesos`, el que devuelve `GET /jo`, y el único con el que se
   restringe algo de verdad (`crearGuardaModul`, ver abajo).

Los dos coexisten en el código sin que ningún ADR documente la transición
de uno a otro. `req.usuari.rol` (el custom claim) hoy no lo lee ningún
handler de negocio — quedó vestigial.

### Implementación real de roles: tabla en Postgres, no custom claims

Dos roles hoy, sembrados por la migración 0014: **`Administrador`** (los 12
módulos, incluida gestión de `usuaris`/`rols`) y **`General`** (los 10
módulos operativos, sin esa gestión). `moduls_permesos` es un `TEXT[]` en
Postgres — parametrizable sin cambiar código (`POST /rols`/`PATCH
/rols/:id`).

**Auto-provisioning** (`resoldre-usuari.ts`): la primera vez que un `uid`
de Firebase llama a cualquier endpoint de negocio, si no existe fila de
`usuari`, se crea en el momento con rol `General` (nunca `Administrador`) y
`nom`/`email` tomados de los claims del token (`name`/`email`; si el
proveedor no trae `name`, usa el `email`; si no trae ni `email`, usa
`{uid}@dpages.local`).

**Restricción real por módulo — hoy sólo en un lugar.**
`crearGuardaModul('usuaris')` (`comu.ts`) es el único guard de módulo que
existe, y sólo se aplica a `POST /usuaris`: sin `"usuaris"` en
`modulsPermesos`, `403 SENSE_PERMIS`. **`PATCH /usuaris/:id` no tiene este
guard** — cualquier usuario autenticado (rol `General` incluido) puede
editar `nom`/`rolId`/`actiu` de cualquier otro usuario, incluido
promoverse a sí mismo a `Administrador` cambiando su propio `rolId`. Esto
contradice el espíritu declarado en `contrato-api.md` §4.12 (*"nadie queda
con gestión de usuarios/roles sólo por loguearse primero... promover a
alguien es una acción manual posterior, hecha por alguien que ya sea
Administrador"*) — el texto asume que sólo un Administrador *usa*
`PATCH /usuaris/:id` para promover a otros, pero el código no impide que
cualquiera lo haga. Es un hallazgo de seguridad real, no sólo de
documentación.

### `GET /jo` — ejemplo real, verificado contra el código

Coincide exactamente con lo documentado en `contrato-api.md` §4.12 —
`usuaris.ts` línea 140 devuelve literalmente `req.usuariResolt` reformado a
`UsuariApi`, sin ninguna consulta adicional (ya lo resolvió el middleware):

```json
{
  "id": 1,
  "firebaseUid": "abc123firebase",
  "nom": "Anna Oficina",
  "email": "anna@dpages.cat",
  "rol": {
    "id": 2,
    "nom": "General",
    "modulsPermesos": ["categories", "comandes", "panell-produccio"]
  },
  "actiu": true
}
```

En desarrollo con `AUTH_DISABLED=true`, el `uid` fijo es `"dev-sense-auth"`
— el primer `GET /jo` de una base nueva auto-provisiona un `usuari` con ese
uid y rol `General` (confirmado por el test
`usuaris.test.ts:53`, *"GET /jo: auto-provisiona con rol General... no
Administrador"*).

---

## 6. Convenciones de datos que el frontend debe conocer

**Decimales: siguen siendo string, confirmado sin cambios.** Todo peso
(`pesKg`, `kgDemanats`, `kgLliurats`, `unitatsPerPorc`, `kgPerUnitat`,
`pesTotal`...) y todo importe (`preuVenda`, `preuUnitari`, `totalLinia`,
`totalEur`, `preu`...) sale de Postgres como columna `NUMERIC` — `pg`
los devuelve como string de JavaScript por diseño (nunca `number`), y
ningún handler los castea a número antes de responder. Verificado en los
`SELECT` de `productes.ts`, `comandes.ts`, `rendiments-porcs.ts`,
`panells.ts`: todos los campos numéricos que exponen escalan explícito con
`::numeric(14,2)`/`::numeric(14,3)` en SQL cuando son sumas/cálculos, y
salen tal cual como los devuelve `pg` en el resto de los casos.

**Fechas: ISO-8601 UTC con `Z`, sin milisegundos — un solo punto de
formateo.** `comu.ts`, función `formatearDataApi`: `Date.toISOString()`
seguido de recortar `.000Z` a `Z`. Se usa de forma consistente en **todos**
los handlers que devuelven fechas — no hay ningún lugar que formatee fecha
a mano por fuera de esta función.

**`kgEditable`: se calcula al escribir, no al leer — confirmar la fórmula
exacta.** No es un cálculo que ocurra en cada `GET`: es la columna
`comanda_linia.pes_editable`, decidida una sola vez, en el momento de crear
la línea (`POST /comandes`, `comandes.ts` línea ~476):
```
si producte.pes_kg !== null:
    pes_calculat_kg = unitats_demanades × producte.pes_kg
    pes_editable = false
si no (artículo "a medida"):
    pes_calculat_kg = kgDemanats (obligatorio, > 0, viene del cuerpo de la petición)
    pes_editable = true
```
El frontend nunca debe recalcular esto a partir de `pesKg` del producto —
la fórmula vive en la escritura, no es derivable de forma confiable sólo
mirando la respuesta de `GET`, porque una vez creada la línea el valor de
`pesEditable` queda fijo aunque el producto cambie de `pesKg` después.

**`preuUnitari` de una línea de pedido: cascada de resolución, nunca a
calcular en el frontend.** `resolverPreuLinia` (`comandes.ts`): 1) precio de
la tarifa asignada al cliente para ese producto (`tarifa_preu`); 2) si no
hay, `producte.preuVenda`; 3) si tampoco hay ninguno de los dos, `"0.00"` y
se registra una incidencia `sense_preu` en la comanda (nuevo tipo, capa
15 — no estaba documentado en `contrato-api.md` §3 hasta ahora, ver
sección 9).

**`num` de comanda: generado por trigger, formato `"NNNNNN"` (6 dígitos,
sin año) desde la migración 0013** — antes era `"AAAA-NNNN"` (con año). El
frontend nunca debe construir ni parsear este valor, sólo mostrarlo.

**`datesProduccioLinies` (capa 21): array de fechas ÚNICAS entre las líneas
del pedido, ordenadas, sin nulls — vacío, nunca `null`, si ninguna línea
tiene fecha.** Se calcula con `array_agg(DISTINCT data_produccio ORDER BY
data_produccio) FILTER (WHERE NOT esborrat AND data_produccio IS NOT NULL)`
en el propio `SELECT` de cabecera — el frontend no debe intentar derivarlo
sumando `linies[].dataProduccio` a mano si alguna vez consume `GET
/comandes/:id` en lugar de `GET /comandes` (el detalle no expone este
campo agregado, sólo el listado — ver `ComandaDetallApi` vs.
`ComandaResumApi` en `packages/shared`).

**`agrupacioRendiment`/`categoria`/`pesTotal` de `RendimentPorc`: de sólo
lectura, derivados en cada `GET`, nunca guardados.** Ver sección 2 — si el
producto cambia de categoría, la próxima lectura de `GET /rendiments-porcs`
refleja la categoría nueva automáticamente, sin que nadie tenga que
actualizar la ficha de rendimiento.

---

## 7. Manejo de errores

**Formato único, sin excepciones — confirmado en `servidor.ts` y
`comu.ts`.** Todo error (incluidos los no capturados por ninguna ruta, vía
`fastify.setErrorHandler`) sale con:
```json
{ "error": { "codi": "...", "missatge": "...", "detalls": [{ "camp": "...", "missatge": "..." }] } }
```
`detalls` es opcional — sólo aparece cuando el error señala campos
específicos (validación de formulario). Un `500` real nunca expone
`err.message` al cliente (queda genérico, *"Error intern del servidor"*),
pero **sí** se loguea completo del lado del servidor
(`logger.error({ err, reqId }, ...)`) — un bug real encontrado durante el
desarrollo (según el comentario del propio `servidor.ts`) fue que sin este
logging explícito, un 500 quedaba invisible en los logs.

**Códigos HTTP usados, confirmados por código real, no sólo por el
contrato**: `400 VALIDACIO`, `401 NO_AUTENTICAT`, `403 SENSE_PERMIS` (nuevo
uso real desde capa 17-19: usuario desactivado, o sin el módulo requerido),
`404 NO_TROBAT`, `409 CONFLICTE` (pedido congelado, `codi`/`nif`/`email`
repetido, categoría con productos activos), `500 ERROR_INTERN`. Los seis
coinciden exactamente con la tabla de `contrato-api.md` §2.

**Errores de validación de campo específico**: `enviarValidacio(reply,
missatge, detalls?)` (`comu.ts`) — cada handler arma su propio array de
`{ camp, missatge }` antes de llamar; no hay validación declarativa
centralizada (ni Zod ni JSON Schema) para los cuerpos de petición de
negocio — sólo se usa Zod para variables de entorno
(`config/env.ts`). Cada ruta valida a mano.

**Un patrón nuevo, capa 14+**: `esViolacioCodiUnic(err)` (`comu.ts`)
traduce específicamente el código Postgres `23505` (unique_violation) a
`409 CONFLICTE` en los handlers de alta que tienen un código único definido
por el usuario (`tarifa.codi`, `transportista.codi`) — antes de esta capa,
el único lugar que traducía este código era `resolucio-client.ts`
(ADR-023), para un caso de negocio distinto durante el sync.

---

## 8. Infraestructura y despliegue

**No pude verificar el estado en vivo** — no tengo acceso a `gcloud` ni a
la consola de GCP desde este entorno. Todo lo que sigue es lo que dice la
documentación del repositorio, con su fecha explícita.

El único documento de estado de infraestructura
(`docs/infraestructura-gcp-estado-16ago.md`) está fechado **17 de agosto de
2026** — **una semana antes de hoy**, y no hay ningún documento posterior
que lo actualice. Según ese documento, a esa fecha:

| Recurso | Estado al 17/08 |
|---|---|
| Proyecto GCP `dpages` | ✅ Facturación activa, `europe-west1` |
| Cloud SQL `dpages-db` | ✅ Postgres 16, `db-f1-micro`, `RUNNABLE`, con las 10 migraciones de esa fecha aplicadas (hoy son 15 — sin confirmar si las 5 nuevas ya corrieron en Cloud SQL real) |
| Firebase Auth | ✅ configurado, `firebaseConfig` disponible |
| Imagen Docker | ✅ construida y subida (tag `v1` — probablemente desactualizada, dado el volumen de capas nuevas desde entonces) |
| Cloud Run `dpages-backend` | ⚠️ servicio creado, **revisión fallida** — el contenedor no arranca porque no tiene `DATABASE_URL` ni el resto de las variables |
| Cuenta de servicio / Secret Manager | ⚠️ creados, pero **sin el binding de permisos** (`roles/cloudsql.client`, `roles/secretmanager.secretAccessor`) — bloqueado por falta de un rol IAM más alto que ninguna cuenta del equipo tenía a esa fecha |

**Sobre el bloqueo de billing mencionado en el pedido**: no encontré
ninguna referencia a un bloqueo de facturación en ningún documento del
repositorio. Lo único documentado sobre facturación es la fila "✅
Facturación activa" en la tabla de arriba — el único bloqueo real que
describe la documentación es el de **permisos IAM** (`setIamPolicy`
requiere `roles/resourcemanager.projectIamAdmin` u Owner, que dependía de
que Eloy lo resolviera "la semana del 17"), no un bloqueo de billing. Si
hubo un bloqueo de facturación distinto y más reciente, no quedó
documentado en este repositorio — hay que confirmarlo directamente con
Gerardo antes de asumir cuál es el estado real hoy, especialmente porque el
plazo que el propio documento menciona ("la semana del 17") ya venció.

**CI/CD**: `.github/workflows/ci.yml` corre en cada push/PR a
`main`/`master` — lint, typecheck, test (contra un Postgres efímero real en
el propio runner, no mockeado) y build, en ese orden. No hay ningún paso de
despliegue automático (build de imagen Docker, push a Artifact Registry,
deploy a Cloud Run) en este workflow — el despliegue sigue siendo manual,
consistente con ADR-012 (las migraciones nunca se aplican al arrancar el
servicio) y con lo que describe la infraestructura: la imagen `v1` se
construyó y subió a mano.

---

## 9. Diferencias conocidas vs. lo asumido en el frontend

Esta sección se cruza contra el frontend real de dPagès (auditado en la
misma sesión, ver `AUDITORIA_FRONTEND.md`), no sólo contra
`contrato-api.md` — el frontend hoy corre enteramente sobre datos mock con
tipos propios en inglés (`lib/api.ts`), sin importar nada de
`@dpages/shared`, así que las diferencias reales son más profundas que un
contrato desalineado.

- **Formato de `num` de comanda.** El mock del frontend
  (`mocks/orders.ts`) genera números tipo `"000073"` (contador simple con
  padding) — que por coincidencia visual se parece al formato real del
  backend (`"000142"`, 6 dígitos, migración 0013), pero el frontend nunca
  debe seguir generando este valor él mismo: es un trigger de Postgres, no
  un contador de cliente.
- **`OrderApi.status` del frontend sólo tiene 2 valores** (`"Oberta"` |
  `"Incidència"`) — el backend real tiene 4 (`oberta`, `en_proces`,
  `tancada`, `amb_incidencia`). No hay mapeo directo definido en ningún
  lado.
- **El frontend no modela `origen` en absoluto** en su `OrderApi` — el
  backend ya tiene el campo completamente funcional (`origen_comanda`,
  sección 3). Cuando se integre, el frontend parte de cero acá, no de una
  migración.
- **El frontend no modela `congelada`/`congelatA`** — la regla de
  congelación (ADR-007), que el backend aplica activamente (`409
  CONFLICTE` en `PATCH /comandes/:id` y en `DELETE .../linies/:liniaId`),
  no tiene ningún reflejo hoy en ninguna pantalla del frontend.
- **Decimales**: el frontend guarda pesos/precios como `number` en todos
  sus tipos (`ProductApi.weightKg: number`, `basePrice: number`,
  `OrderLineApi.orderedWeightKg: number`) — el backend real, confirmado en
  la sección 6, los manda siempre como `string`. Es una conversión
  obligatoria en el borde de integración, no un detalle menor.
- **`PigYieldApi`/Panell Producció, del lado del frontend, se construyeron
  contra un contrato que en su momento decía "no construir" — hoy el
  backend real ya lo implementa (`GET /rendiments-porcs`,
  `GET /panells/produccio`), así que esta diferencia se cerró desde el
  lado del backend.** Vale la pena que quien planifique la integración
  compare campo a campo `RendimentPorcApi`/`PanellProduccioFilaApi` (sección
  2 y 3 de este documento) contra `PigYieldApi`/`ProductionRow` del
  frontend (sección 3 de `AUDITORIA_FRONTEND.md`) — son conceptualmente
  parecidos pero no iguales: el backend ya no expone `producte` en ninguna
  de las dos respuestas (BREAKING, capa 22), mientras que el frontend sigue
  mostrando el producto por fila.
- **`/users` del frontend (CRUD completo, con contraseña en texto plano en
  el mock) vs. `usuaris`/`rols` reales del backend**: el backend real tiene
  un modelo bastante más específico de lo que el frontend anticipó —
  auto-provisioning, `linkEstabliment` de un solo uso en vez de contraseña
  elegida en el alta, `modulsPermesos` como array de strings en vez de un
  enum de 4 roles fijos (`office`/`workshop`/`packaging`/`production`, que
  no existen en el backend real — hoy sólo hay `Administrador`/`General`).
  Esta es la diferencia más grande de todo el documento: el frontend
  modeló una pantalla de usuarios asumiendo un sistema de roles
  completamente distinto al que el backend terminó construyendo.
- **Restricción de rutas por rol en el frontend**: el frontend restringe
  navegación por rol de verdad (`lib/roles.ts`, `ROLE_ROUTES`). El backend
  real, confirmado en la sección 5, **no restringe ningún endpoint de
  negocio por rol** (salvo el caso puntual de `POST /usuaris`) — el
  concepto de "módulo" que sí existe en el backend (`modulsPermesos`) es
  para decidir qué mostrar en el menú, no para bloquear acceso, y no
  coincide 1:1 con los 4 roles fijos que el frontend ya construyó.
- **Búsqueda parcial vs. exacta**: el frontend usa `.includes()` (parcial)
  en absolutamente todos sus filtros de texto — coincide hoy con 4 de los 7
  endpoints reales del backend que tienen búsqueda (los viejos), pero no
  con los 3 nuevos que ya son exactos (sección 3). Si el criterio final
  termina siendo "todo exacto", tanto el frontend como los 4 endpoints
  viejos del backend necesitan el mismo ajuste.

---

## 10. Pendientes explícitos

**Grep dirigido sobre todo `packages/backend/src`** (`TODO`, `FIXME`,
`XXX`, `HACK`, `pendiente`) — un solo resultado real, el resto son falsos
positivos del español ("TODO el histórico", "pendiente de definición" como
prosa de comentario, no como marcador):

- `auth-firebase.ts:152` — `TODO(capa 19 / frontend): actualizar "url" a la
  pantalla real de establecimiento de contraseña en cuanto Michel la tenga
  lista` — hoy `ACTION_CODE_SETTINGS_ESTABLIMENT.url` apunta al propio
  backend como placeholder (nadie la ve: Firebase redirige ahí recién
  DESPUÉS de que la persona ya estableció su contraseña, así que no es
  urgente, pero queda pendiente).

**Endpoint documentado y no implementado**: el CRUD completo de
`/origens-comanda` (sección 1) — el gap más concreto de todo este
documento, porque la tabla y la FK ya están listas del lado de datos.

**`openapi.yaml` desactualizado**: su propia cabecera afirma que
`rendiments-porcs`, `panells/produccio`, `usuaris`, `rols` y `jo` no están
implementados — falso, los cinco existen y tienen test. Sólo
`origens-comanda` sigue sin implementar. Vale la pena corregir esa nota
antes de que alguien la use para planificar trabajo asumiendo que esos
cinco módulos todavía no existen.

**ADRs desactualizados respecto al código**: `decisiones-arquitectura.md`
termina en ADR-023, pero el código ya refleja decisiones de las capas 13 a
22 que no tienen ADR propio — entre ellas, al menos tres que sí parecen
del calibre de un ADR según el criterio que el propio documento se dio
(*"si un cambio de código contradice un ADR vigente, el commit tiene que
actualizarlo"*, y por extensión, toda decisión de arquitectura nueva
debería quedar registrada):
  - La migración de `OrigenComanda` de enum a tabla (migraciones 0011/0013).
  - El sistema de `usuari`/`rol` con auto-provisioning y la app de Firebase
    separada (`obtenerAppFirebaseAdmin`) por el problema real de permisos
    de Identity Toolkit documentado en el comentario de `auth-firebase.ts`
    — ese hallazgo (la cuenta de servicio de Cloud Run nunca tuvo acceso
    real a Identity Toolkit pese a sus roles de IAM) es exactamente el tipo
    de cosa que un ADR existe para no perder.
  - La restricción por módulo (`crearGuardaModul`) como primera excepción a
    ADR-021.

**Cobertura de test — huecos puntuales**:
- `GET /productes/:id` — implementado, sin test dedicado.
- `POST /transportistes` y `PATCH /transportistes/:id` — implementados,
  sin ningún test (el único test del archivo cubre sólo `GET`).
- `GET /usuaris?actiu=` — el filtro existe en el código, no hay test que lo
  ejercite.
- Un webhook duplicado (mismo `woo_order_id` recibido dos veces) no tiene
  un test end-to-end que confirme que el segundo procesamiento es un
  no-op limpio — el mecanismo de idempotencia (guardián de versión + lock)
  sí está testeado por partes, pero no ese escenario específico completo.

**Deuda de esquema, señalada por el propio código**:
- `comanda.origen` (la columna vieja, deprecated desde migración 0013)
  sigue existiendo en la tabla — el propio comentario de la migración dice
  que se elimina "en una migración aparte, más adelante", todavía no
  hecha.
- `comanda_linia.confirmat_per` sigue siendo `TEXT` (el uid de Firebase),
  no una FK a `usuari` — pese a que la tabla `usuari` ya existe desde la
  migración 0014. El handler de `PATCH .../lliurament` resuelve el nombre
  a mostrar vía `req.usuariResolt` en la respuesta, pero lo que persiste en
  base sigue siendo el string crudo del uid, no el `id` interno del
  usuario.
- **Hallazgo de seguridad, no sólo de esquema**: `PATCH /usuaris/:id` no
  exige el módulo `"usuaris"` (a diferencia de `POST /usuaris`, que sí lo
  exige) — hoy cualquier usuario autenticado con rol `General` puede
  cambiar su propio `rolId` a `Administrador` sin que nada se lo impida.
  Ver sección 5 para el detalle completo.
