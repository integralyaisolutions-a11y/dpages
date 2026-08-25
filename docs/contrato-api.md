# Contrato de la API — dPagès

**Versión 1.0 · agosto 2026 · VisioFlow Tech**

Este documento define la forma de la API interna entre el backend (Gerardo) y el
frontend (Michel). Su propósito es que ambos puedan trabajar en paralelo sin
esperarse: Michel construye contra datos simulados que respetan este contrato, y
cuando el backend esté listo sólo cambia de dónde vienen los datos.

Va en el repositorio como `docs/contrato-api.md`.

---

## 1. Cómo usar este documento

**Para Michel:** cada endpoint incluye una respuesta JSON de ejemplo completa.
Copiálas tal cual como datos simulados. Si respetás esas formas, el día que
conectemos la API real las pantallas no se enteran del cambio.

**Los tipos TypeScript están en `@dpages/shared`.** No los redefinas en el
frontend: importalos. Si necesitás un campo que no existe, avisame antes de
tocar ese paquete — lo usamos los dos.

**Regla de oro:** si algo de este documento no coincide con lo que hace el
backend, es un error del backend, no del frontend. Avisá.

### Notas de arquitectura

**El sistema dejó de tratarse como espejo de WooCommerce** (confirmado con el
cliente el 18/08/2026). Es el sistema de pedidos propio; WooCommerce es un
canal de entrada más, no la fuente de verdad. Esto ya se aplicaba a los
pedidos — ahora se extiende al catálogo en un punto puntual:

**El catálogo se sigue sincronizando desde WooCommerce** (artículos,
precios, etc.) — eso no cambió. Pero **la categoría del producto ya NO se
sincroniza**: es autoridad del propio sistema, relacionada por SKU. Si en
algún momento WooCommerce y el sistema discrepan en a qué categoría
pertenece un artículo, gana el sistema.

---

## 2. Convenciones generales

### Base

```
Desarrollo local:  http://localhost:8080/api/v1
Producción:        https://<pendiente>/api/v1
```

La URL base va en una variable de entorno del frontend, nunca escrita a mano
en el código.

### Autenticación

Todas las rutas de negocio (todo lo de la sección 4) requieren el token de
Firebase Auth. `/salut`, el webhook de WooCommerce y `/tasques/*` quedan
afuera — tienen su propio mecanismo, no te conciernen desde el frontend.

```
Authorization: Bearer <Firebase ID token>
```

Sin token o con uno inválido: `401 NO_AUTENTICAT`. El backend valida el token
de verdad (no hay ningún modo "sin autenticación" salvo en desarrollo local
del propio backend, con una variable de entorno que vos no controlás) — no lo
des por opcional en ningún ambiente donde pruebes contra el backend real.

Ningún endpoint restringe por rol: cualquier usuario autenticado puede llamar
cualquier ruta. El rol (custom claim de Firebase) sólo decide en qué panel lo
ubicás por defecto al entrar — ver `decisiones-arquitectura.md`, ADR-021.

### CORS

En desarrollo, el backend sólo acepta peticiones cross-origin desde
`http://localhost:3000` — si tu servidor de desarrollo corre en otro puerto,
avisame para agregarlo. En producción el origen permitido es explícito por
variable de entorno; si tu dominio de producción no está configurado ahí, el
navegador va a bloquear la petición aunque el token sea válido.

### Idioma

```
Accept-Language: ca        (por defecto)
Accept-Language: es
```

El backend devuelve los textos ya resueltos en el idioma pedido. El frontend
no tiene que elegir entre versiones ni conocer la duplicación que existe en
WooCommerce.

> Pendiente de confirmar con el cliente si el sistema es bilingüe o sólo
> catalán. El contrato funciona en ambos casos: si es monolingüe, la cabecera
> simplemente se ignora.

### Formatos de dato

| Tipo            | Formato                 | Ejemplo                  | Motivo                                                                           |
| --------------- | ----------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| Fecha y hora    | ISO-8601 UTC con `Z`    | `"2026-08-15T09:30:00Z"` | La conversión a hora local de Cataluña se hace en el frontend, en un único punto |
| Pesos (kg)      | **String**, 3 decimales | `"1.250"`                | Confirmado por el cliente: siempre kg con 3 decimales                            |
| Importes (€)    | **String**, 2 decimales | `"12.50"`                | Los decimales en coma flotante de JavaScript pierden precisión al sumar          |
| Unidades        | Número entero           | `3`                      |                                                                                  |
| Identificadores | Número entero           | `142`                    |                                                                                  |

**Importante sobre los decimales:** llegan como texto, no como número. Para
mostrarlos, formatealos; para operar con ellos, convertí explícitamente. Si el
backend enviara `12.5` como número de JavaScript, sumar cien líneas daría un
total con centavos fantasma.

### Sobre los identificadores

El campo `id` que devuelve la API es un número entero secuencial por tabla,
no la clave interna real de la base de datos (que es UUID). Es una capa de
simplificación deliberada: el contrato se mantiene legible con ids chicos,
y la clave interna nunca se expone hacia afuera. Para el frontend esto es
transparente — usá el id tal como viene en cada respuesta, en cualquier
endpoint que lo pida de vuelta.

Documentado en ADR-019.

### Paginación

Parámetros de consulta:

```
?pagina=1&mida=50
```

`mida` por defecto 50, máximo 200. Todas las respuestas de listado vienen
envueltas:

```json
{
  "dades": [ ... ],
  "paginacio": {
    "pagina": 1,
    "mida": 50,
    "total": 137,
    "totalPagines": 3
  }
}
```

### Ordenación

```
?ordre=dataComanda:desc
?ordre=client:asc
```

### Errores

Siempre con esta forma, en cualquier código de estado:

```json
{
  "error": {
    "codi": "VALIDACIO",
    "missatge": "Les unitats lliurades no poden ser zero",
    "detalls": [{ "camp": "unitatsLliurades", "missatge": "ha de ser més gran que zero" }]
  }
}
```

| Código HTTP | `codi`          | Cuándo                                               |
| ----------- | --------------- | ---------------------------------------------------- |
| 400         | `VALIDACIO`     | Datos mal formados o que violan una regla de negocio |
| 401         | `NO_AUTENTICAT` | Falta el token o está vencido                        |
| 403         | `SENSE_PERMIS`  | Autenticado pero sin permiso para esa acción         |
| 404         | `NO_TROBAT`     | El recurso no existe                                 |
| 409         | `CONFLICTE`     | Por ejemplo, editar un pedido congelado              |
| 500         | `ERROR_INTERN`  | Fallo del servidor                                   |

`missatge` está pensado para mostrarse al usuario y viene en catalán.

---

## 3. Enumeraciones

Todas están en `@dpages/shared`. Importalas, no las escribas a mano.

```typescript
type EstatComanda = 'oberta' | 'en_proces' | 'tancada' | 'amb_incidencia';
type TipusProducte = 'simple' | 'variable';
type Idioma = 'ca' | 'es';
```

> **`origen` (de `ComandaResumApi`/`ComandaDetallApi`) dejó de ser un enum
> fijo** (confirmado 18/08/2026): es el `codi` de una tabla mantenible
> (`origen_comanda`), no un union literal — por eso el tipo en
> `@dpages/shared` es `string`, no una lista cerrada. Los valores válidos
> hoy son `"woocommerce"` y `"manual"`; es extensible sin tocar código (a
> futuro, `"manual"` se puede desglosar en `"whatsapp"`/`"email"`/`"telefon"`
> agregando una fila, no una migración de tipo). Ver la sección "Orígenes
> de pedido" para el CRUD.

Etiquetas para mostrar (el backend no las envía, van en el frontend):

| Valor            | Catalán        | Castellano     |
| ---------------- | -------------- | -------------- |
| `oberta`         | Oberta         | Abierta        |
| `en_proces`      | En procés      | En proceso     |
| `tancada`        | Tancada        | Cerrada        |
| `amb_incidencia` | Amb incidència | Con incidencia |

`incidencies[].tipus` (de `GET /comandes/:id`, ver sección 4.5) **no** es un
enum cerrado en el backend — es texto libre en base, para no exigir una
migración cada vez que aparece un motivo nuevo. Los valores que existen hoy
en datos reales:

| Valor                        | Significado                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `article_no_resolt`          | Una línea del pedido no pudo resolverse a ningún artículo del catálogo.  |
| `conflicte_identitat_client` | El NIF/email resuelto contradice el ya registrado para ese cliente.      |
| `sense_dades_client`         | El pedido no trae ni NIF ni email utilizable — no se pudo crear cliente. |

No lo trates como un enum fijo en el frontend: mostrá `tipus` tal cual si no
lo reconocés, en vez de asumir que la lista de arriba es exhaustiva.

---

## 4. Endpoints por pantalla

En el orden de prioridad que marcó el cliente.

---

### 4.1 · Categories

**`GET /categories`**

```json
{
  "dades": [
    {
      "id": 1,
      "nom": "Fresc",
      "elaboratPorc": true,
      "agrupacioRendiment": "KG"
    },
    {
      "id": 2,
      "nom": "Embotits cuits",
      "elaboratPorc": true,
      "agrupacioRendiment": "PAQ"
    },
    {
      "id": 4,
      "nom": "Magre",
      "elaboratPorc": true,
      "agrupacioRendiment": "MAGRE"
    },
    {
      "id": 3,
      "nom": "Conserves",
      "elaboratPorc": false,
      "agrupacioRendiment": null
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 16, "totalPagines": 1 }
}
```

**`POST /categories`**

```json
{ "nom": "Elaborats", "elaboratPorc": true, "agrupacioRendiment": "MAGRE" }
```

Respuesta `201`, misma forma que una fila de `GET /categories`.
`elaboratPorc` arranca en `false` si no se manda. Misma validación cruzada
que el `PATCH` de abajo: `agrupacioRendiment` sólo se acepta si
`elaboratPorc` es `true`.

**`PATCH /categories/:id`** — cuerpo parcial, sólo los campos a cambiar.

**`DELETE /categories/:id`** — borrado protegido: si **cualquier** producto
todavía usa esta categoría — **activo o inactivo, sin distinción** (capa 27) — responde `409 CONFLICTE` con el recuento en el mensaje en vez de
dejar productos con una referencia rota. `204` sin cuerpo si el borrado se
pudo hacer.

> Un producto inactivo bloquea el borrado exactamente igual que uno activo
> — nunca se borra una categoría "por transitividad" sin acción explícita.
> Razón: si se permitiera borrar con productos inactivos asociados, un
> producto reactivado más tarde aparecería sin categoría sin que nadie lo
> haya tocado directamente. (Antes de la capa 27, la guarda sólo contaba
> productos activos, pero la FK de la base no distingue por `actiu` —
> Postgres bloqueaba el `DELETE` igual, y el error cae como `500` en vez de
> `409` porque no estaba capturado; ya corregido.)

> **`agrupacioRendiment`** (confirmado con el cliente el 18/08/2026, ya no
> pendiente) toma uno de tres valores, y decide cómo esa categoría entra en
> el cálculo del Panell Producció (ver esa sección):
>
> - **`"KG"`** — el rendimiento se calcula en kilos.
> - **`"PAQ"`** — el rendimiento se calcula en paquetes/unidades.
> - **`"MAGRE"`** — no participa fila por fila: va al total global de
>   `PanellProduccioApi.totals`.
>
> **`null` sólo cuando `elaboratPorc` es `false`** — es una regla de
> negocio (esa categoría no participa del cálculo de rendimiento porcino),
> no un dato pendiente de cargar. Si `elaboratPorc` es `true`, siempre trae
> uno de los tres valores.

---

### 4.2 · Catàleg de productes

**`GET /productes`**

Filtros: `?categoriaId=1&tipus=simple&actiu=true&cerca=llom`

```json
{
  "dades": [
    {
      "id": 12,
      "codi": "LLF01",
      "descripcio": "Llom fresc de porc",
      "descripcioVenda": "Llom",
      "tipus": "simple",
      "pesKg": "1.250",
      "preuVenda": "9.86",
      "actiu": true,
      "categoria": { "id": 1, "nom": "Fresc" },
      "agrupacioProduccio": "Llom",
      "format": "SENCER",
      "envasat": "NORMAL (pes)"
    },
    {
      "id": 13,
      "codi": "PIC01",
      "descripcio": "Picada de porc",
      "descripcioVenda": "Picada",
      "tipus": "simple",
      "pesKg": null,
      "preuVenda": "7.60",
      "actiu": true,
      "categoria": { "id": 1, "nom": "Fresc" },
      "agrupacioProduccio": null,
      "format": null,
      "envasat": "NORMAL"
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 111, "totalPagines": 3 }
}
```

**`GET /productes/:id`** · **`POST /productes`** · **`PATCH /productes/:id`**

> **`pesKg` puede ser `null`, y eso es funcional, no un error.** Significa que
> es un artículo _a medida_: en la línea de pedido su peso queda a cero y es
> editable. Si tiene peso, el campo de la línea se calcula solo y **no es
> editable**. Es una regla que el cliente confirmó por escrito, y afecta
> directamente al comportamiento de la pantalla de pedidos.
>
> Hoy casi todo el catálogo tiene `pesKg` en `null`, porque el dato aún no
> llegó del cliente. Michel: construí bien los dos caminos.

> **Tres campos nuevos, confirmados con el cliente el 18/08/2026:**
>
> - **`agrupacioProduccio`** — texto libre. Agrupa varios códigos bajo una
>   misma familia lógica de producción (por ejemplo, variantes de un mismo
>   corte que se elaboran juntas). `null` si el artículo no pertenece a
>   ninguna agrupación. Es la misma agrupación que usa el Panell Producció.
> - **`format`** — uno de `"SENCER"`, `"TALLAT"`, `"LLESCAT"`, o `null`.
> - **`envasat`** — uno de `"NORMAL"`, `"NORMAL (pes)"`, `"NORMAL (web)"`,
>   `"ESPECIAL"`, o `null`.
>
> No los trates como opcionales en el sentido de "puede faltar el dato": los
> tres pueden ser `null` legítimamente cuando no aplican a ese artículo.

---

### 4.3 · Llistat de tarifes

La matriz de precios: una fila por artículo, una columna por tarifa, editable
en celda.

**`GET /tarifes/matriu`**

Filtros: `?categoriaId=1&cerca=llom`

```json
{
  "tarifes": [
    { "id": 1, "codi": "GEN", "nom": "General" },
    { "id": 2, "codi": "REST", "nom": "Restaurants" },
    { "id": 3, "codi": null, "nom": "Botigues" }
  ],
  "dades": [
    {
      "producteId": 12,
      "codi": "LLF01",
      "descripcio": "Llom fresc de porc",
      "preus": { "1": "9.86", "2": "8.90", "3": "9.20" }
    },
    {
      "producteId": 13,
      "codi": "PIC01",
      "descripcio": "Picada de porc",
      "preus": { "1": "7.60", "2": null, "3": "7.10" }
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 111, "totalPagines": 3 }
}
```

Las claves de `preus` son los identificadores de tarifa en texto. `null` significa
que ese artículo no tiene precio en esa tarifa.

> `tarifes[].codi` puede ser `null` en tarifas que todavía no tienen código
> cargado (las que ya existían antes de que el alta empezara a pedirlo como
> obligatorio).

**`POST /tarifes`**

```json
{ "codi": "VIP", "nom": "Clients VIP" }
```

Respuesta `201`, misma forma que una fila de `tarifes[]` de la matriz de
arriba. `codi` es obligatorio y único — un `codi` repetido responde
`409 CONFLICTE`.

**`PATCH /tarifes/:tarifaId/preus/:producteId`**

```json
{ "preu": "9.50" }
```

Respuesta `200`:

```json
{ "tarifaId": 1, "producteId": 12, "preu": "9.50" }
```

> Guarda una sola celda. El cliente pidió expresamente edición en línea sin
> ventana emergente, igual que el mantenimiento de tarifas del prototipo.

---

### 4.4 · Tarifes per client

**`GET /clients`**

Filtros: `?cerca=nom&tarifaId=2&actiu=true`

```json
{
  "dades": [
    {
      "id": 45,
      "codi": "CLI45",
      "nom": "Restaurant Example",
      "nif": "B12345678",
      "email": "exemple@example.com",
      "telefon": "600000000",
      "poblacio": "Manresa",
      "tarifa": { "id": 2, "nom": "Restaurants" },
      "transportistaDefecte": { "id": 1, "nom": "DHL" },
      "actiu": true
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 1222, "totalPagines": 25 }
}
```

> **`codi` (capa 25):** ya no queda vacío para ningún cliente. Los clientes
> resueltos por el sync de WooCommerce (`resolverOCrearClient`) reciben uno
> autogenerado, `CLI` + `id` (el mismo `id` público de este mismo objeto),
> **sin ancho fijo** — `CLI45`, `CLI4916`, `CLI15118`, lo que corresponda.
> (Un intento inicial rellenaba con ceros a 3 dígitos como en el ejemplo de
> arriba; se descartó porque TRUNCABA en vez de ensanchar en cuanto el id
> llegaba a 4 cifras — dos clientes reales con id 4916 y 4918 generaban el
> mismo código y chocaban contra el índice único.) Los clientes existentes
> de antes de la capa 25 se completaron una sola vez con un script de
> backfill. `POST /clients` (alta manual, más abajo) sigue pidiendo `codi`
> explícito — nunca se autogenera ahí, es decisión de quien carga el
> pedido.

**`PATCH /clients/:id`** — para asignar tarifa o transportista.

**`POST /clients`** — alta manual. Es el camino de los pedidos por teléfono y
WhatsApp, que no traen ningún cliente de WooCommerce que resolver.

```json
{
  "codi": "CLI200",
  "nom": "Forn del Barri",
  "poblacio": "Vic",
  "tarifaId": 2,
  "email": "forn@example.com",
  "telefon": "600222333",
  "nif": "B87654321"
}
```

`codi`, `nom` y `poblacio` son obligatorios (los campos mínimos del
prototipo). `tarifaId`, `email`, `telefon` y `nif` son opcionales —
`email`/`telefon`/`nif` no aparecen en el modal del prototipo, pero hacen
falta como dato de contacto en los pedidos que no vienen de la web.

Respuesta `201`, misma forma que una fila de `GET /clients`:

```json
{
  "id": 200,
  "codi": "CLI200",
  "nom": "Forn del Barri",
  "nif": "B87654321",
  "email": "forn@example.com",
  "telefon": "600222333",
  "poblacio": "Vic",
  "tarifa": { "id": 2, "nom": "Restaurants" },
  "transportistaDefecte": null,
  "actiu": true
}
```

**`GET /transportistes`**

```json
{
  "dades": [
    { "id": 1, "codi": "TR-DHL", "nom": "DHL", "actiu": true },
    { "id": 2, "codi": null, "nom": "Recollida a la botiga", "actiu": true }
  ]
}
```

**`POST /transportistes`**

```json
{ "nom": "Seur", "codi": "TR-SEUR" }
```

Respuesta `201`, misma forma que una fila de `GET /transportistes`.
`codi` es opcional (texto libre, nemotécnico) pero único cuando se manda —
un `codi` repetido responde `409 CONFLICTE`.

**`PATCH /transportistes/:id`** — cuerpo parcial (`nom` y/o `codi`).

---

### 4.5 · Comandes

**`GET /comandes`**

Filtros: `?estat=oberta&clientId=45&origen=web&dataDes=2026-08-01&dataFins=2026-08-31&dataProduccioDes=&dataProduccioFins=&dataLliuramentDes=&dataLliuramentFins=&cerca=142`

```json
{
  "dades": [
    {
      "id": 142,
      "num": "000142",
      "origen": "woocommerce",
      "estat": "oberta",
      "client": { "id": 45, "nom": "Restaurant Example", "poblacio": "Manresa" },
      "tarifa": { "id": 2, "nom": "Restaurants" },
      "transportista": { "id": 1, "nom": "DHL" },
      "poblacioDesti": "Manresa",
      "adrecaLliurament": "Carrer Major, 12, 3r 2a",
      "dataComanda": "2026-08-14T09:12:00Z",
      "dataProduccio": "2026-08-16T00:00:00Z",
      "datesProduccioLinies": ["2026-08-20T00:00:00Z", "2026-08-21T00:00:00Z"],
      "dataExpedicio": "2026-08-17T00:00:00Z",
      "dataLliurament": "2026-08-18T00:00:00Z",
      "bultos": 3,
      "totalLinies": 8,
      "totalKg": "24.500",
      "totalEur": "312.40",
      "congelada": false,
      "totalIncidencies": 0,
      "tipusIncidencia": null
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 411, "totalPagines": 9 }
}
```

> **`totalIncidencies`/`tipusIncidencia`** son el resumen liviano para no pedir
> el detalle completo por cada fila de una tabla con cientos de resultados.
> `tipusIncidencia` sólo trae un valor cuando **todas** las incidencias de esa
> comanda son del mismo tipo — si hay mezcla (por ejemplo un
> `article_no_resolt` y un `conflicte_identitat_client` en la misma comanda),
> queda `null` y hay que abrir el detalle (`GET /comandes/:id`) para ver de
> qué se trata. El detalle completo de motivos está en `incidencies` de esa
> misma respuesta — ver abajo.
>
> **`datesProduccioLinies`** (capa 21): las fechas de producción DISTINTAS
> entre las líneas del pedido (`linies[].dataProduccio`, ver más abajo),
> ordenadas cronológicamente, sin nulls — **array vacío** si ninguna línea
> tiene fecha de producción cargada, nunca `null`. Distinto de
> `dataProduccio` (el campo de arriba, a nivel de CABECERA del pedido): un
> pedido puede tener varias líneas con fechas de producción distintas entre
> sí (visto en el demo: la columna "Fecha producción" de la pantalla
> Pedidos mostraba `20/08/2026, 21/08/2026` para un mismo pedido). Viaja en
> ISO-8601 UTC como cualquier otra fecha del contrato (sección 2) — el
> frontend arma el string separado por comas y lo formatea a fecha local,
> en el mismo punto único donde ya hace esa conversión para el resto de las
> fechas. No hay una razón para que este campo rompa esa convención.
>
> **`dataDes`/`dataFins`** filtran por `dataComanda` (cuándo entró el
> pedido al sistema — `comanda.creat_en`), sin cambios. Los tres pares
> nuevos son independientes entre sí y de éste:
>
> - **`dataProduccioDes`/`dataProduccioFins`** — mismo nombre que ya usa
>   `GET /panells/obrador` (sección 4.7), pero acá filtra por el PEDIDO
>   completo: matchea si **al menos una** de sus líneas tiene
>   `dataProduccio` dentro del rango (la misma línea cumple ambos extremos
>   a la vez, no dos líneas distintas cumpliendo cada una un extremo).
>   Pensado para planificación ("qué pedidos tienen algo que producir esta
>   semana").
> - **`dataLliuramentDes`/`dataLliuramentFins`** — mismo patrón de nombres
>   (`<campo>Des`/`<campo>Fins`) que ya usan `dataExpedicioDes`/`Fins` en
>   `GET /panells/oficina`/`GET /panells/empaquetat`, aplicado acá a
>   `dataLliurament` (fecha de entrega de la cabecera) — coincidencia
>   simple `>=`/`<=`, sin la semántica de "al menos una línea" de arriba.

**`GET /comandes/:id`** — incluye las líneas:

```json
{
  "id": 142,
  "num": "000142",
  "origen": "woocommerce",
  "estat": "oberta",
  "client": { "id": 45, "nom": "Restaurant Example", "poblacio": "Manresa" },
  "tarifa": { "id": 2, "nom": "Restaurants" },
  "transportista": { "id": 1, "nom": "DHL" },
  "poblacioDesti": "Manresa",
  "adrecaLliurament": "Carrer Major, 12, 3r 2a",
  "dataComanda": "2026-08-14T09:12:00Z",
  "dataProduccio": "2026-08-16T00:00:00Z",
  "dataExpedicio": "2026-08-17T00:00:00Z",
  "dataLliurament": "2026-08-18T00:00:00Z",
  "bultos": 3,
  "obsProduccio": "Tallar més gruixut",
  "obsLliurament": "Entregar pels matins",
  "totalKg": "24.500",
  "totalEur": "312.40",
  "congelada": false,
  "congelatA": null,
  "linies": [
    {
      "id": 981,
      "ordinal": 1,
      "producte": { "id": 12, "codi": "LLF01", "descripcio": "Llom fresc de porc" },
      "categoria": "Fresc",
      "format": "SENCER",
      "envasat": "NORMAL (pes)",
      "unitatsDemanades": 10,
      "kgDemanats": "12.500",
      "kgEditable": false,
      "unitatsLliurades": 0,
      "kgLliurats": "0.000",
      "confirmatA": null,
      "preuUnitari": "9.86",
      "totalLinia": "98.60",
      "dataProduccio": "2026-08-16T06:00:00Z",
      "obsProduccio": "Tallar fi",
      "esborrat": false
    },
    {
      "id": 982,
      "ordinal": 2,
      "producte": { "id": 13, "codi": "PIC01", "descripcio": "Picada de porc" },
      "categoria": "Fresc",
      "format": null,
      "envasat": "NORMAL",
      "unitatsDemanades": 4,
      "kgDemanats": "0.000",
      "kgEditable": true,
      "unitatsLliurades": 0,
      "kgLliurats": "0.000",
      "confirmatA": null,
      "preuUnitari": "7.60",
      "totalLinia": "30.40",
      "dataProduccio": null,
      "obsProduccio": null,
      "esborrat": false
    }
  ],
  "incidencies": [
    {
      "tipus": "article_no_resolt",
      "detall": "Línia 2: SKU sense alias a AliasProducte",
      "creatA": "2026-08-14T09:12:05Z"
    }
  ]
}
```

> **`incidencies`** es el motivo detrás de `"estat": "amb_incidencia"` — vacío
> si el pedido no tiene ninguna. `tipus` es uno de los valores documentados en
> la sección 3 (por ejemplo `article_no_resolt`, `conflicte_identitat_client`,
> `sense_dades_client`); `detall` es texto libre pensado para que oficina
> entienda el problema sin tener que investigar en la base. Ordenado del más
> antiguo al más nuevo — si hay más de una, la primera suele ser la causa
> original.

> **`adrecaLliurament`** es la dirección de entrega en texto libre — distinta
> de `poblacioDesti`, que es sólo la población/ciudad. Editable vía
> `PATCH /comandes/:id`, igual que `poblacioDesti`.
>
> **`linies[].dataProduccio`** es la fecha de producción de ESA línea en
> particular, distinta de `dataProduccio` a nivel de cabecera (la de arriba,
> que es del pedido completo). El prototipo muestra ambas como editables por
> separado.
>
> **`linies[].categoria`/`format`/`envasat`** (capa 20): mismos tres campos
> que ya devuelve `GET /panells/obrador` para esta misma línea (sección
> 4.7), resueltos igual — `categoria` es el nombre de la categoría del
> artículo, `format`/`envasat` vienen tal cual de la ficha del producto.
> `null` cuando la línea no tiene artículo resuelto, o cuando el artículo
> no tiene esos campos cargados.

**`POST /comandes`** — alta manual. Es el camino de los pedidos por teléfono,
correo y WhatsApp, que son la mayoría del volumen real.

```json
{
  "origen": "manual",
  "clientId": 45,
  "dataLliurament": "2026-08-20T00:00:00Z",
  "transportistaId": 1,
  "obsLliurament": "Entregar pels matins",
  "linies": [
    { "producteId": 12, "unitatsDemanades": 10 },
    { "producteId": 13, "unitatsDemanades": 4, "kgDemanats": "3.200" }
  ]
}
```

**`PATCH /comandes/:id`** · **`DELETE /comandes/:id/linies/:liniaId`**

> **Dos reglas que afectan la pantalla:**
>
> **`kgEditable`** te dice si el campo de kilos de esa línea se puede editar.
> Viene calculado por el backend según si el artículo tiene peso en su ficha.
> No lo deduzcas en el frontend: usá el campo.
>
> **No se puede grabar un pedido con líneas a cero** en unidades o kilos. El
> backend lo rechaza con `400 VALIDACIO`, pero validalo también en el
> formulario para no hacer viajar la petición.
>
> **`congelada`** en `true` significa que el pedido entró en producción y ya no
> admite cambios desde la web. Cualquier intento de modificarlo devuelve
> `409 CONFLICTE`. Mostralo visualmente.

---

### 4.6 · Panell Oficina

Sólo lectura, con filtros y subtotales.

**`GET /panells/oficina`**

Filtros: `?dataExpedicioDes=&dataExpedicioFins=&transportistaId=&estat=&clientId=`

```json
{
  "totals": {
    "comandes": 12,
    "linies": 97,
    "totalKg": "284.750",
    "totalEur": "3612.80"
  },
  "dades": [
    {
      "comandaId": 142,
      "num": "000142",
      "client": "Restaurant Example",
      "poblacioDesti": "Manresa",
      "tarifa": "Restaurants",
      "transportista": "DHL",
      "estat": "oberta",
      "dataComanda": "2026-08-14T09:12:00Z",
      "dataExpedicio": "2026-08-17T00:00:00Z",
      "dataLliurament": "2026-08-18T00:00:00Z",
      "linies": 8,
      "totalKg": "24.500",
      "totalEur": "312.40",
      "obsProduccio": "Tallar més gruixut",
      "obsLliurament": "Entregar pels matins",
      "totalIncidencies": 0,
      "tipusIncidencia": null
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 12, "totalPagines": 1 }
}
```

> `totals` corresponde a **todo lo filtrado**, no sólo a la página visible. Es
> el bloque de subtotales que va arriba de la tabla.
>
> `totalIncidencies`/`tipusIncidencia`: mismo criterio que en `GET /comandes`
> (sección 4.5) — resumen liviano, el detalle completo está en
> `GET /comandes/:id`.

---

### 4.7 · Panell Obrador

**Cambio de criterio, confirmado con el cliente el 18/08/2026 (prototipo +
reunión): ya NO es "agrupado por producto".** Obrador muestra líneas de
pedido individuales, sin agrupar — cada fila es una línea real de un pedido
real, no un total sumado. `TotalsPanellObradorApi` no cambió:
`linies`/`totalUnitats`/`totalKg` siguen siendo válidos sumados sobre las
líneas individuales visibles.

**`GET /panells/obrador`**

Filtros: `?dataProduccioDes=&dataProduccioFins=&categoriaId=&tipus=&producte=&format=&envasat=`

```json
{
  "totals": {
    "linies": 34,
    "totalUnitats": 187,
    "totalKg": "142.300"
  },
  "dades": [
    {
      "liniaId": 981,
      "comandaId": 142,
      "producte": { "id": 12, "codi": "LLF01", "descripcio": "Llom fresc de porc" },
      "categoria": "Fresc",
      "format": "SENCER",
      "envasat": "NORMAL (pes)",
      "client": "Restaurant Example",
      "dataProduccio": "2026-08-16T06:00:00Z",
      "unitats": 10,
      "kg": "12.500",
      "obsProduccio": "Tallar fi"
    },
    {
      "liniaId": 982,
      "comandaId": 142,
      "producte": { "id": 13, "codi": "PIC01", "descripcio": "Picada de porc" },
      "categoria": "Fresc",
      "format": null,
      "envasat": "NORMAL",
      "client": "Restaurant Example",
      "dataProduccio": null,
      "unitats": 4,
      "kg": "0.000",
      "obsProduccio": null
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 34, "totalPagines": 1 }
}
```

> Cada fila es exactamente una `comanda_linia` — `liniaId`/`comandaId`
> identifican de qué pedido viene, por si obrador necesita volver al
> detalle. `dataProduccio` es la de la LÍNEA (ver sección 4.5), no la de la
> cabecera del pedido.

> **Filtros nuevos (capa 20), pedidos por el demo de Lovable:**
>
> - **`producte`** filtra por `producte.descripcio` — coincidencia EXACTA,
>   sin distinguir mayúsculas/minúsculas (no substring). Mismo criterio que
>   `GET /rendiments-porcs` y `GET /panells/produccio` (sección 4.10) — es
>   una regla transversal del proyecto: el frontend pasa la descripción
>   completa tal como aparece en un desplegable, no un texto de búsqueda
>   libre.
> - **`format`**/**`envasat`** filtran por `producte.format`/`producte.envasat`
>   — coincidencia exacta.
>
> Ningún filtro nuevo devuelve error si no matchea nada: `dades` queda
> vacío y `totals` en cero, igual que cualquier otro filtro de este panel.

---

### 4.8 · Panell Empaquetat

**Es el único panel con edición.** Todo lo demás es sólo lectura.

**`GET /panells/empaquetat`**

Filtros: `?dataExpedicioDes=&dataExpedicioFins=&transportistaId=&clientId=`

```json
{
  "totals": {
    "linies": 50,
    "unitatsDemanades": 312,
    "unitatsLliurades": 118,
    "kgDemanats": "284.750",
    "kgLliurats": "96.400",
    "liniesConfirmades": 18,
    "liniesPendents": 32
  },
  "dades": [
    {
      "liniaId": 981,
      "comandaId": 142,
      "num": "000142",
      "dataExpedicio": "2026-08-17T00:00:00Z",
      "dataLliurament": "2026-08-18T00:00:00Z",
      "transportista": "DHL",
      "client": "Restaurant Example",
      "codi": "LLF01",
      "producte": "Llom fresc de porc",
      "unitatsDemanades": 10,
      "kgDemanats": "12.500",
      "unitatsLliurades": 0,
      "kgLliurats": "0.000",
      "confirmatA": null,
      "confirmatPer": null
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 50, "totalPagines": 1 }
}
```

---

### 4.9 · Rendiments Porcs

Nueva (confirmada con el cliente el 18/08/2026). Ficha de rendimiento por
producto: cuántas unidades salen de un cerdo y cuánto pesa cada una — es la
base del cálculo del Panell Producció (sección 4.10).

**`GET /rendiments-porcs`**

Filtros: `?agrupacioRendiment=KG&categoria=Fresc&agrupacioProduccio=Llom&producte=Llom fresc de porc`

`producte` filtra por descripció con **coincidencia exacta** (no
case-sensitive) — regla 3.1 transversal del proyecto
(`docs/especificacion-funcional-dpages.md`): buscar "Llom" no debe traer
"Cap de llom". Igual que `agrupacioRendiment`/`categoria`/`agrupacioProduccio`,
que también son coincidencia exacta.

```json
{
  "dades": [
    {
      "id": 1,
      "agrupacioRendiment": "KG",
      "categoria": "Fresc",
      "agrupacioProduccio": "Llom",
      "unitatsPerPorc": "2.00",
      "kgPerUnitat": "3.500",
      "pesTotal": "7.000"
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 42, "totalPagines": 1 }
}
```

> **BREAKING (capa 22):** la fila ya NO trae `producte` — Francesc sacó esa
> columna de la pantalla (ver nota de Panell Producció más abajo, mismo
> motivo). `producteId` sigue existiendo como campo de ENTRADA de
> `POST /rendiments-porcs` (el alta/edición sigue necesitando elegir el
> producto) — esto sólo afecta lo que se devuelve. El filtro `?producte=`
> tampoco cambia.

> `agrupacioRendiment`, `categoria` y `agrupacioProduccio` son de **sólo
> lectura** acá: se derivan del producto/categoría asociados (secciones 4.1
> y 4.2), no se editan en este CRUD. `pesTotal` es calculado por el backend
> (`unitatsPerPorc × kgPerUnitat`), tampoco se envía en las escrituras.
>
> Una fila sólo aparece en el listado si el producto asociado pertenece a
> una categoría con `agrupacioRendiment` definido (no `null`) — si no, no
> hay con qué rellenar `agrupacioRendiment`/`categoria`, que en este
> contrato no son nulables. `POST` aplica la misma regla como validación de
> alta (ver abajo), así que en la práctica una fila nunca debería quedar
> "invisible" salvo que la categoría del producto cambie _después_ de
> crearla.

**`POST /rendiments-porcs`**

```json
{ "producteId": 12, "unitatsPerPorc": "2.00", "kgPerUnitat": "3.500" }
```

`unitatsPerPorc` admite hasta 2 decimales, `kgPerUnitat` hasta 3 (mismas
escalas que la columna en base). Rechaza con `400 VALIDACIO` si el producto
no existe o si su categoría no tiene `agrupacioRendiment` definido — sin
esto, la fila creada no podría aparecer nunca en el `GET` (ver nota arriba).

Respuesta `201`, misma forma que una fila de `GET /rendiments-porcs`.

**`PATCH /rendiments-porcs/:id`** — línea por línea, mismo criterio de
edición en línea que el resto del sistema (sin ventana emergente). Cuerpo
parcial: `unitatsPerPorc` y/o `kgPerUnitat`. `producteId` no se edita una vez
creada la fila.

**`DELETE /rendiments-porcs/:id`** — `204` sin cuerpo.

---

### 4.10 · Panell Producció

Confirmada con el cliente el 18/08/2026, implementada en la capa 16. Sólo
lectura. Una fila por **agrupació de producció** (no por producte
individual — varios artículos pueden compartir una misma agrupación) con
demanda en el rango filtrado, calculada a partir de los pedidos y de la
ficha de `Rendiments Porcs`.

**`GET /panells/produccio`**

Filtros: `?nombrePorcs=5&agrupacioRendiment=KG&producte=Llom fresc de porc&dataDes=2026-08-01&dataFins=2026-08-31`

- **`nombrePorcs` es obligatorio.** Sin él, o con `0`/negativo, responde
  `400 VALIDACIO` — es una calculadora interactiva, un default silencioso
  podría hacer pensar que un número inventado es el resultado real.
- `producte` filtra por descripció con **coincidencia exacta**
  (case-insensitive), igual que `GET /rendiments-porcs` (regla 3.1
  transversal del proyecto).
- `dataDes`/`dataFins` son opcionales — default `dataDes` = mañana (hoy +
  1 día), `dataFins` = hoy + 7 días.

> **BREAKING (capa 22):** la fila de respuesta ya NO trae `producte`.
> Anteriormente traía sólo UN artículo representativo de la agrupación (el
> de `id` más chico entre los que la componen, elegido de forma
> determinística) — con datos reales, una agrupación de producción suele
> tener varios SKUs asociados, y mostrar sólo uno confundía más de lo que
> ayudaba. Francesc lo sacó de las dos pantallas afectadas (esta y
> Rendiments Porcs, sección 4.9). El filtro `?producte=` sigue existiendo
> — esto sólo afecta la respuesta, no la capacidad de filtrar. No afecta al
> cálculo, que siempre opera sobre la agrupación completa.

```json
{
  "totals": {
    "totalKgAElaborar": "0.000",
    "totalKgMagro": "0.000",
    "diferencia": "0.000"
  },
  "dades": [],
  "paginacio": { "pagina": 1, "mida": 50, "total": 0, "totalPagines": 0 }
}
```

**Las tres fórmulas**, según `agrupacioRendiment` de la categoría de cada
producto — cada agrupación calcula un par distinto de campos, el resto
queda en `null` por fila:

**Agrupación `"KG"`** (cálculo por línea, en kilos — sólo `kgAElaborar`
tiene valor, `paqPedido` queda `null`, no aplica):

```
Rendiment  = unitatsPerPorc × kgPerUnitat × nombrePorcs
Diferencia = Rendiment − kgAElaborar
```

Ejemplo real (con `nombrePorcs = 5`): producto **COSTELLETA**,
`unitatsPerPorc = 2,00`, `kgPerUnitat = 12,000`.
`Rendiment = 2,00 × 12,000 × 5 = 120,000`. Con `kgAElaborar = 35,000`:
`Diferencia = 120,000 − 35,000 = 85,000`.

**Agrupación `"PAQ"`** (cálculo por línea, en unidades — sólo `paqPedido`
tiene valor, `kgAElaborar` queda `null`):

```
Rendiment  = unitatsPerPorc × nombrePorcs
Diferencia = Rendiment − paqPedido
```

Ejemplo real: producto **PEUS**, `unitatsPerPorc = 4,00`,
`nombrePorcs = 5`. `Rendiment = 4,00 × 5 = 20,00`. Con `paqPedido = 132,00`:
`Diferencia = 20,00 − 132,00 = −112,00` (negativo: se pidió más de lo que
rinden esos cerdos).

**Agrupación `"MAGRE"`** (sin cálculo por línea — `rendiment`/`diferencia`
quedan `null` en estas filas; se calcula un único total global, no se
reparte fila por fila):

```
totalKgMagro      = Σ(kgPerUnitat de cada agrupación de producción marcada
                       como magra en Rendiments Porcs) × nombrePorcs
diferencia global = totalKgMagro − totalKgAElaborar
```

Ejemplo real: tres agrupaciones magras rinden 12, 6 y 7 kg por cerdo
respectivamente. Con `nombrePorcs = 5`: `totalKgMagro = (12 + 6 + 7) × 5 =
125`. Con `totalKgAElaborar = 512,982` (ver abajo): `Diferencia = 125 −
512,982 = −387,982`.

**`totals.totalKgAElaborar`** (cabecera): suma de la columna `kgAElaborar`
de **todas** las filas visibles (incluidas las de agrupación `"KG"`) en el
rango de fechas filtrado — no sólo las de agrupación `"MAGRE"`.

> Estas fórmulas se derivaron por ingeniería inversa contra los datos de
> ejemplo del prototipo de Lovable, y verifican exacto en las 13 filas de
> referencia disponibles. **Pendiente de ratificación formal por el cliente
> (Francesc)** — no bloquea la implementación, pero si al confirmarlas
> aparece alguna corrección, esta sección (y el cálculo del backend cuando
> exista) se actualiza.

---

### 4.11 · Orígens de comanda

Nueva (confirmada con el cliente el 18/08/2026). CRUD simple de la tabla
`origen_comanda` — reemplaza el enum fijo `OrigenComanda` que tenía el
contrato hasta esta versión (ver sección 3).

**`GET /origens-comanda`**

```json
{
  "dades": [
    { "id": 1, "codi": "woocommerce", "nom": "WooCommerce", "actiu": true },
    { "id": 2, "codi": "manual", "nom": "Manual", "actiu": true }
  ]
}
```

**`POST /origens-comanda`**

```json
{ "codi": "whatsapp", "nom": "WhatsApp" }
```

Respuesta `201`, misma forma que una fila de `GET /origens-comanda`
(`actiu` arranca en `true` si no se manda).

**`PATCH /origens-comanda/:id`** — cuerpo parcial (`nom`, `actiu`). `codi`
no se edita una vez creado — es la clave estable que usan
`ComandaResumApi.origen`/`ComandaDetallApi.origen`.

**`DELETE /origens-comanda/:id`** — `204` sin cuerpo. En la práctica,
preferí `PATCH { "actiu": false }` si ya hay pedidos usando ese origen —
borrarlo de verdad puede dejar pedidos existentes con un `origen` que ya
no resuelve a nada.

---

### 4.12 · Usuaris i rols

Confirmada con el cliente el 18/08/2026, implementada en la capa 17. Un
**rol** define qué módulos de la aplicación puede VER el usuario — no
restringe acciones dentro de un módulo. Ver ADR-021: hasta la capa 19,
ningún endpoint de negocio bloqueaba por rol; `modulsPermesos` era sólo lo
que el **frontend** usaba para decidir qué mostrar en el menú. La capa 19
(`POST /usuaris`, más abajo) es la **primera excepción**: el backend
mismo exige el módulo `"usuaris"` porque dar de alta gente con acceso al
sistema no puede quedar librado a que el frontend oculte el botón. El
resto de los endpoints sigue sin restricción de rol.

> **Decisión de negocio ya tomada:** hoy existen dos roles. `"General"`
> tiene acceso a todos los módulos **operativos** del negocio (lo que
> pidió el cliente, "todos ven todo"); `"Administrador"` tiene además la
> gestión de usuarios y roles (`usuaris`, `rols`). **Todo usuario nuevo se
> asigna a `"General"` automáticamente** (ver auto-provisioning más
> abajo) — nadie obtiene gestión de usuarios/roles sólo por loguearse
> primero. Promover a alguien a `"Administrador"` es una acción manual
> posterior, hecha por alguien que ya sea Administrador, vía
> `PATCH /usuaris/:id { "rolId": <id de Administrador> }`. El sistema de
> roles queda parametrizable sin desarrollo futuro si algún día quieren
> más granularidad: basta con crear más roles (`POST /rols`) y reasignar
> usuarios, no hace falta ningún cambio de código.

**`GET /rols`**

```json
{
  "dades": [
    {
      "id": 1,
      "nom": "Administrador",
      "modulsPermesos": [
        "categories",
        "catalog",
        "tarifes",
        "tarifes-clients",
        "comandes",
        "rendiments-porcs",
        "panell-oficina",
        "panell-obrador",
        "panell-empaquetat",
        "panell-produccio",
        "usuaris",
        "rols"
      ]
    },
    {
      "id": 2,
      "nom": "General",
      "modulsPermesos": [
        "categories",
        "catalog",
        "tarifes",
        "tarifes-clients",
        "comandes",
        "rendiments-porcs",
        "panell-oficina",
        "panell-obrador",
        "panell-empaquetat",
        "panell-produccio"
      ]
    }
  ]
}
```

**`POST /rols`** · **`PATCH /rols/:id`** (cuerpo parcial)

```json
{ "nom": "Obrador", "modulsPermesos": ["panell-obrador"] }
```

> No hay `DELETE /rols/:id` todavía — un rol en uso por algún `usuari` no
> se puede borrar sin dejarlo sin rol (`usuari.rolId` es obligatorio). Se
> agrega en una capa posterior si hace falta, con el mismo criterio de
> borrado protegido que ya usa `DELETE /categories/:id`.

**`GET /usuaris`**

Filtros: `?actiu=true`

```json
{
  "dades": [
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
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 8, "totalPagines": 1 }
}
```

**`PATCH /usuaris/:id`** (cuerpo parcial) — sólo `nom`, `rolId` y `actiu`.
`firebaseUid` y `email` son **inmutables** una vez creado el usuario (el
vínculo con el token de Firebase no se reasigna a mano).

```json
{ "nom": "Anna Empaquetat", "rolId": 2 }
```

> Tampoco hay `DELETE /usuaris/:id`: para dar de baja a alguien,
> `PATCH { "actiu": false }` (ver rechazo 403 abajo) — igual que
> `origen_comanda`, borrar de verdad podría dejar referencias rotas
> (`comanda_linia.confirmatPer`, auditoría).

**`POST /usuaris`** (capa 19) — alta manual de un usuario, hecha por un
Administrador. **Sólo accesible para usuarios con `"usuaris"` en su
`modulsPermesos`**; sin ese módulo, `403 SENSE_PERMIS` (mismo código que
el rechazo por `actiu = false` de abajo, pero el motivo es otro: acá no es
que el usuario esté desactivado, es que su rol no incluye este módulo).

```json
{ "nom": "Marc Empaquetat", "email": "marc@dpages.cat", "rolId": 2 }
```

Respuesta `201`:

```json
{
  "usuari": {
    "id": 9,
    "firebaseUid": "xyz789firebase",
    "nom": "Marc Empaquetat",
    "email": "marc@dpages.cat",
    "rol": { "id": 2, "nom": "General", "modulsPermesos": ["categories", "comandes"] },
    "actiu": true
  },
  "linkEstabliment": "https://.../__/auth/action?mode=resetPassword&oobCode=..."
}
```

> **No hay envío de email automático — el backend no tiene esa
> capacidad.** El flujo es: (1) valida que `rolId` exista y que el email
> no esté ya usado (`409 CONFLICTE` si sí); (2) crea el usuario en
> Firebase Authentication (sin contraseña utilizable — se genera una
> aleatoria descartable, nadie la conoce); (3) crea la fila de `usuari`
> local; (4) genera con el Admin SDK de Firebase un link de "establecé tu
> contraseña" de **un solo uso** (`generatePasswordResetLink`) y lo
> devuelve en `linkEstabliment`. **El Administrador que dio de alta a la
> persona es quien comparte ese link a mano**, por el canal que use
> (WhatsApp, email personal, lo que sea) — el frontend debe mostrarlo de
> forma que se pueda copiar fácilmente, porque no hay ninguna otra manera
> de que la persona nueva lo reciba. Si algo falla después de crear el
> usuario en Firebase (el alta local o generar el link), el backend
> revierte borrando el usuario de Firebase — nunca queda un usuario
> huérfano allá sin fila local acá.
>
> El campo `linkEstabliment` nunca debe quedar en un log ni guardarse en
> ningún sitio más allá de esta respuesta — es un token de un solo uso que
> da acceso a establecer la contraseña de otra persona.

**`GET /jo`** — devuelve el usuario autenticado (resuelto por el `uid` del
token de Firebase, sección 2) con su rol y módulos permitidos. Es lo
primero que llama el frontend después de loguearse, para saber en qué
panel ubicar a la persona por defecto y qué mostrar en el menú.

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

#### Auto-provisioning (comportamiento observable, no sólo interno)

**Todo endpoint de negocio (sección 2) resuelve automáticamente un
`usuari` a partir del `uid` del token de Firebase.** Si es la primera vez
que ese `uid` llama a la API, el sistema **crea la fila de `usuari`
en el momento**, con:

- `rolId` = el rol `"General"` (siempre, hoy — ver decisión de negocio
  arriba). **Nunca** `"Administrador"`: nadie obtiene gestión de usuarios
  ni roles sólo por loguearse primero. Alguien ya-Administrador tiene que
  promoverlo a mano después, con `PATCH /usuaris/:id`.
- `nom`/`email` = los claims `name`/`email` del propio token; si el
  proveedor de autenticación no trae `name`, se usa el `email`.
- `actiu` = `true`.

Esto es deliberado: no bloquea a nadie con una pantalla de alta de
usuarios que todavía no existe. Sigue activo incluso ahora que existe
`POST /usuaris` (capa 19) — ambos caminos conviven: alta manual por un
Administrador de antemano, o auto-provisioning la primera vez que alguien
se loguea sin haber sido dado de alta. Revisar si conviene desactivarlo
(exigiendo que el usuario ya exista) es una decisión pendiente, no
tomada todavía.

**Usuario existente con `actiu = false`:** la petición se rechaza con
`403 SENSE_PERMIS` antes de llegar a cualquier endpoint — no hay forma de
que un usuario desactivado siga usando el sistema con un token todavía
válido.

---

## 5. El endpoint de empaquetado

Es el más delicado del sistema. Merece su propia sección.

**`PATCH /comandes/:comandaId/linies/:liniaId/lliurament`**

```json
{
  "unitatsLliurades": 8,
  "kgLliurats": "9.750"
}
```

Respuesta `200`:

```json
{
  "liniaId": 981,
  "comandaId": 142,
  "unitatsLliurades": 8,
  "kgLliurats": "9.750",
  "confirmatA": "2026-08-15T11:42:00Z",
  "confirmatPer": { "id": 7, "nom": "Operari empaquetat" }
}
```

### Reglas de negocio, confirmadas por el cliente

**Ambos campos son obligatorios y no pueden quedar en cero.** El backend
rechaza con `400 VALIDACIO`.

**Ambos llegan siempre en cero por defecto**, aunque coincidan con lo pedido.
El operario debe teclearlos de todos modos. Es doble confirmación deliberada:
el cliente quiere que la persona _escriba_ el peso, no que marque un visto
bueno, porque el visto bueno se convierte en automatismo.

**No se puede guardar sin confirmar.** Rellenar los campos y no marcar la
confirmación no es un estado válido.

**Por qué existe todo esto:** por mermas se envía menos de lo pedido —una
longaniza sale más corta, falta materia prima— y la diferencia entre lo pedido
y lo enviado determina si se emite un abono o se cobra de más. Es conciliación
económica, no un detalle de interfaz.

### Requisitos de interfaz, pedidos expresamente

**Sin ventanas emergentes.** Edición en línea: columna editable más un botón de
aceptar por fila, con el mismo patrón del mantenimiento de tarifas.

El motivo lo explicó el consultor funcional del cliente con claridad: el
operario tiene delante una lista de unas 50 líneas y debe rellenarlas _todas_.
Cincuenta ventanas emergentes, con el camión esperando, es inviable. Y cada vez
que una ventana se cierra, la persona tiene que volver a ubicar visualmente en
qué fila estaba.

**Una llamada por fila.** No acumules cambios para enviarlos juntos: si el
operario confirma una fila, esa fila se guarda. Si la conexión se corta, no se
pierde el trabajo de las anteriores.

---

## 6. Salud del servicio

**`GET /salut`** — sin autenticación.

```json
{ "estat": "ok", "versio": "0.1.0", "baseDades": "ok" }
```

---

## 7. Pendiente de definición

No están en el contrato porque el cliente todavía no los definió. Michel: no
construyas nada encima de estos puntos.

| Tema                                     | Estado                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Fórmulas del Panell Producció            | Shape de la respuesta cerrado (sección 4.10); los números de las tres fórmulas (KG/PAQ/MAGRE) todavía no |
| Descuentos                               | El 45 % de los pedidos web llevan cupón, pero quedaron fuera de esta versión. Sin confirmar              |
| Asignación de transportista              | Sin criterio definido                                                                                    |
| Si el sistema es bilingüe o sólo catalán | Sin confirmar                                                                                            |

> **Resuelto el 18/08/2026** (ya no pendiente, ya está en el contrato):
> campos de agrupación del catálogo (`agrupacioProduccio`, `format`,
> `envasat`, sección 4.2), `agrupacioRendiment` de categoría (sección 4.1),
> y el shape de Panell Producció y Rendiments Porcs (secciones 4.9 y 4.10
> — sólo faltan los números de las fórmulas, ver arriba).

---

## 8. Cómo simular la API mientras no exista

Sugerencia para arrancar mañana sin depender del backend.

Poné cada respuesta de ejemplo de este documento en un archivo dentro de
`packages/frontend/src/mocks/`, y creá una única capa de acceso a datos que en
desarrollo lea de ahí y en producción llame a la API real. Toda petición pasa
por esa capa; ningún componente llama a `fetch` directamente.

Así, el día que conectemos, se cambia un archivo y nada más.

Tres cosas que conviene simular desde el principio, porque son los casos que
más rompen interfaces cuando aparecen tarde:

- Un artículo con `pesKg` en `null` (a medida) junto a otro con peso.
- Un pedido con `congelada: true`.
- Una respuesta de error `400 VALIDACIO`, para que el formulario sepa mostrarla.

---

## 9. Control de cambios

Este contrato es un acuerdo entre dos personas. Si hace falta cambiarlo:

1. Se avisa antes de tocar `@dpages/shared`.
2. Se actualiza este documento en el mismo cambio.
3. Los cambios que rompen compatibilidad se conversan, no se empujan.
