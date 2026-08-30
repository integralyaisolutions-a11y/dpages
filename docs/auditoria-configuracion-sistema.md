# Auditoría de "configuración de sistema" — informe

Fecha: 2026-08-29. Sólo investigación — nada de lo listado abajo fue implementado.

## Grupo 1 — Necesita pantalla de configuración (backend real, falta UI)

### 1.1 Transportistes

Tabla `transportista` (migración 0011) con columnas `nom`, `codi` (único
sólo entre no-nulos), `actiu`. Contrato real confirmado leyendo
`packages/backend/src/http/rutes/api/transportistes.ts`:

| Método | Ruta | Payload | Comportamiento |
|---|---|---|---|
| GET | `/transportistes?pagina&mida` | — | Paginado, orden por `nom` |
| POST | `/transportistes` | `{ nom, codi? }` | 201; `nom` obligatorio; 409 si `codi` duplicado |
| PATCH | `/transportistes/:id` | `{ nom?, codi? }` | 200; `nom` no puede quedar vacío; 409 si `codi` duplicado |
| DELETE | — | — | **No existe.** No hay `fastify.delete` en el archivo. |

Hoy sólo se consume de sólo lectura vía `useCarriers.ts` (confirmado:
comentario explícito en el hook — "Sólo lectura: esta pantalla no gestiona
transportistes, sólo los consume para el select de Comandes") en
Comandes/Panell Oficina/Empaquetat. No existe ningún archivo
`transport*` bajo `app/`.

**Sí tiene sentido una pantalla tipo Categories** (listado + alta/edición):
el contrato ya es idéntico en forma al de Categories (paginado, POST,
PATCH, validación de campo obligatorio, conflicto por código duplicado),
sólo le falta DELETE — que ni falta, dado que ninguna otra tabla referencia
`transportista_id` todavía (no hay lógica de "en uso" que replicar de
Categories). Contrato listo para armar el prompt de implementación tal
cual está arriba.

## Grupo 2 — Bloqueado, necesita backend primero

### 2.1 Orígens de comanda

Sigue exactamente como en la investigación original de Comandes — **no
cambió nada**. Evidencia:

- La tabla `origen_comanda` (`id`, `codi`, `nom`, `actiu`) existe desde la
  migración 0011, y desde la 0013 `comanda.origen_id` es FK real hacia
  ella (la columna vieja `comanda.origen` — el enum `web/email/whatsapp/
  telefon` — está marcada `DEPRECATED` en su propio comentario de columna,
  no se lee ni se escribe desde código nuevo).
- **No existe ningún archivo de rutas para `origens-comanda`** — grep sobre
  `origens-comanda|origens_comanda|registrarRutesOrigen` en todo
  `packages/backend/src` no encuentra nada, y `servidor.ts` no registra
  ningún `registrarRutesOrigen*`. Los únicos 4 endpoints de negocio con
  tabla propia y sin ruta expuesta son justamente estos.
- El único lugar donde se escribe/lee `origen_comanda` es
  `comandes.ts` (resuelve `codi → id` al crear un pedido) y
  `seed-arranque.ts`, que hoy sólo carga **2 filas**: `woocommerce` y
  `manual` — no los 4 canales de negocio reales (web/correu/whatsapp/
  telèfon) que describe `CLAUDE.md`. Esto es una discrepancia a marcar
  para Gerardo: el seed de arranque no refleja los 4 canales reales del
  negocio, sólo un origen técnico binario (automático vs. manual).
- **En el frontend no hay ningún rastro de "origen"**: grep sobre
  `origen` en `OrderForm.tsx` y `orders/page.tsx` no da ningún resultado
  — ni selector al crear pedido, ni filtro al listar. Es decir, hoy nadie
  puede filtrar ni asignar el origen de un pedido desde la UI, ni
  siquiera de forma manual/read-only.

**Qué pedirle a Gerardo**: los 4 endpoints CRUD sobre `/origens-comanda`
(mismo patrón que Transportistes: GET paginado, POST, PATCH; DELETE a
decidir si hace falta) y decidir si el seed de arranque debe ampliarse a
los 4 canales reales de negocio antes de exponer esto en ninguna pantalla
— sin eso, un selector de "origen" en Comandes hoy sólo ofrecería
"WooCommerce"/"Manual", que no es lo que describe el negocio.

## Grupo 3 — Correctamente fijo, no es candidato

### 3.1 Estats de comanda

**Es CHECK constraint real**, no convención de aplicación. Confirmado en
`migrations/0003_model_transaccional.up.sql:42`:

```sql
CHECK (estat IN ('oberta', 'en_proces', 'tancada', 'amb_incidencia'))
```

Ninguna migración posterior toca esta constraint. Cambiar los estados
posibles de un pedido es una regla de negocio real (afecta a los 4
paneles y a toda la lógica de transición), no un ajuste de configuración
— descartado con fundamento.

### 3.2 Format / Envasat (Catàleg)

**CHECK constraints reales**, migración `0011_cataleg_extens.up.sql:11,13`:

```sql
CHECK (format IN ('SENCER', 'TALLAT', 'LLESCAT'));
CHECK (envasat IN ('NORMAL', 'NORMAL (pes)', 'NORMAL (web)', 'ESPECIAL'));
```

El frontend (`ProductForm.tsx` líneas 13-14, `workshop/page.tsx` líneas
21-22) hardcodea exactamente estos mismos 3+4 valores en
`FORMAT_OPTIONS`/`PACKAGING_OPTIONS`/`ENVASAT_OPTIONS` — coincide 1:1 con
la base, no hay drift. Descartado como candidato de configuración.

### 3.3 Agrupació Rendiment (Categories / Rendiments Porcs)

**CHECK constraint real**, misma migración, línea 22-23:

```sql
CHECK (agrupacio_rendiment IN ('KG', 'MAGRE', 'PAQ') OR agrupacio_rendiment IS NULL);
```

`CategoryFormModal.tsx` línea 11 hardcodea `AGRUPACIO_RENDIMENT_OPTIONS =
["— Cap —", "MAGRE", "KG", "PAQ"]` — coincide con la constraint (más el
valor "sin agrupación" = `null`, que ya está contemplado en la constraint
con `OR ... IS NULL`). Descartado como candidato de configuración.

### 3.4 Barrido completo del frontend — sin hallazgos nuevos

Grep de `_OPTIONS =` / `_VALUES =` / `_LABELS =` sobre todo
`packages/frontend/src` da sólo 4 archivos, ya cubiertos:

- `workshop/page.tsx`: `FORMAT_OPTIONS`/`ENVASAT_OPTIONS` → 3.2, filtros de sólo lectura.
- `catalog/ProductForm.tsx`: `FORMAT_OPTIONS`/`PACKAGING_OPTIONS`/`STATUS_OPTIONS` → 3.2 + booleano `actiu` (Sí/No), no es config.
- `categories/CategoryFormModal.tsx`: `ELABORAT_PORC_OPTIONS` (booleano) + `AGRUPACIO_RENDIMENT_OPTIONS` → 3.3.
- `users/page.tsx`: `STATUS_OPTIONS = [ALL, "Actiu", "Inactiu"]`, filtro sobre el booleano `actiu` de usuari — no es config, es un filtro de estado sobre un campo existente.

No apareció ningún array/enum hardcodeado adicional que no esté ya
cubierto por los 4 casos conocidos o que represente un dato inventado sin
respaldo de backend. `MODUL_LABELS` (`lib/roles.ts`, usado en
`users/page.tsx`) es un mapa de etiquetas de UI para los módulos de rol
existentes — no es un catálogo de negocio, es texto de interfaz atado al
código de rutas (`MODUL_ROUTES`), no hace falta pantalla.

### 3.5 Parámetros de sincronización WooCommerce

Revisé `packages/backend/src/http/rutes/tasques.ts` (los 3 endpoints que
dispara Cloud Scheduler: `/tasques/sync-comandes`, `/tasques/sync-cataleg`,
`/tasques/reconciliar`). **Ninguno de los 3 acepta body ni query
params** — la ventana de reconciliación está hardcodeada en el propio
código (`finestraReconciliacio(7)`, 7 días fijos), y las credenciales de
WooCommerce y los intervalos de Cloud Scheduler viven fuera del código,
en variables de entorno / configuración de infraestructura (Cloud
Scheduler), nunca en una tabla ni endpoint propio. **No hay ningún
parámetro configurable expuesto que hoy no esté conectado a una
pantalla** — confirmado, no asumido: no hace falta UI para esto, es
correcto que viva sólo en entorno/infraestructura.

### 3.6 Categories — formulario completo

Comparé el schema real de `categoria_producte` (migraciones 0008 + 0011:
`nom`, `elaborat_porc`, `agrupacio_rendiment`, más `id`/`id_seq`) contra
`categories.ts` (GET/POST/PATCH/DELETE) y `CategoryFormModal.tsx`: **los
3 campos de negocio están expuestos en el formulario, ninguno falta.**
`DELETE` está protegido con conflicto 409 si hay productos usando la
categoría — ya cubierto, sin cambios pendientes.

## Resumen para decidir plan de trabajo

| # | Caso | Categoría |
|---|---|---|
| 1 | Transportistes | **Necesita pantalla** — contrato listo, sin DELETE |
| 2 | Orígens de comanda | **Bloqueado** — 0 de 4 endpoints existen, seed no refleja los 4 canales reales |
| 3 | Estats de comanda | Fijo — CHECK constraint, regla de negocio |
| 4 | Format / Envasat | Fijo — CHECK constraint |
| 5 | Agrupació Rendiment | Fijo — CHECK constraint |
| 6 | Sync WooCommerce | Fijo — vive en entorno/infraestructura, sin params expuestos |
| 7 | Categories | Completo — sin campos faltantes en el formulario |
