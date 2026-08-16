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

Todas las rutas excepto `/salut` requieren el token de Firebase Auth:

```
Authorization: Bearer <Firebase ID token>
```

Mientras Firebase no esté configurado, el backend en modo desarrollo acepta
peticiones sin token. No dependas de eso para producción.

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
type OrigenComanda = 'web' | 'email' | 'whatsapp' | 'telefon';
type TipusProducte = 'simple' | 'variable';
type Idioma = 'ca' | 'es';
```

Etiquetas para mostrar (el backend no las envía, van en el frontend):

| Valor            | Catalán        | Castellano     |
| ---------------- | -------------- | -------------- |
| `oberta`         | Oberta         | Abierta        |
| `en_proces`      | En procés      | En proceso     |
| `tancada`        | Tancada        | Cerrada        |
| `amb_incidencia` | Amb incidència | Con incidencia |

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
      "agrupacioRendiment": null
    },
    {
      "id": 2,
      "nom": "Embotits cuits",
      "elaboratPorc": true,
      "agrupacioRendiment": null
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

**`PATCH /categories/:id`** — cuerpo parcial, sólo los campos a cambiar.

> `agrupacioRendiment` viene siempre `null` por ahora. Es uno de los campos de
> agrupación que el cliente define en la reunión del lunes. Michel: dejá la
> columna preparada pero no construyas lógica encima todavía.

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
      "categoria": { "id": 1, "nom": "Fresc" }
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
      "categoria": { "id": 1, "nom": "Fresc" }
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

---

### 4.3 · Llistat de tarifes

La matriz de precios: una fila por artículo, una columna por tarifa, editable
en celda.

**`GET /tarifes/matriu`**

Filtros: `?categoriaId=1&cerca=llom`

```json
{
  "tarifes": [
    { "id": 1, "nom": "General" },
    { "id": 2, "nom": "Restaurants" },
    { "id": 3, "nom": "Botigues" }
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
      "codi": "CLI045",
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

**`PATCH /clients/:id`** — para asignar tarifa o transportista.

**`GET /transportistes`**

```json
{
  "dades": [
    { "id": 1, "nom": "DHL", "actiu": true },
    { "id": 2, "nom": "Recollida a la botiga", "actiu": true }
  ]
}
```

---

### 4.5 · Comandes

**`GET /comandes`**

Filtros: `?estat=oberta&clientId=45&origen=web&dataDes=2026-08-01&dataFins=2026-08-31&cerca=142`

```json
{
  "dades": [
    {
      "id": 142,
      "num": "2026-0142",
      "origen": "web",
      "estat": "oberta",
      "client": { "id": 45, "nom": "Restaurant Example", "poblacio": "Manresa" },
      "tarifa": { "id": 2, "nom": "Restaurants" },
      "transportista": { "id": 1, "nom": "DHL" },
      "poblacioDesti": "Manresa",
      "dataComanda": "2026-08-14T09:12:00Z",
      "dataProduccio": "2026-08-16T00:00:00Z",
      "dataExpedicio": "2026-08-17T00:00:00Z",
      "dataLliurament": "2026-08-18T00:00:00Z",
      "bultos": 3,
      "totalLinies": 8,
      "totalKg": "24.500",
      "totalEur": "312.40",
      "congelada": false
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 411, "totalPagines": 9 }
}
```

**`GET /comandes/:id`** — incluye las líneas:

```json
{
  "id": 142,
  "num": "2026-0142",
  "origen": "web",
  "estat": "oberta",
  "client": { "id": 45, "nom": "Restaurant Example", "poblacio": "Manresa" },
  "tarifa": { "id": 2, "nom": "Restaurants" },
  "transportista": { "id": 1, "nom": "DHL" },
  "poblacioDesti": "Manresa",
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
      "unitatsDemanades": 10,
      "kgDemanats": "12.500",
      "kgEditable": false,
      "unitatsLliurades": 0,
      "kgLliurats": "0.000",
      "confirmatA": null,
      "preuUnitari": "9.86",
      "totalLinia": "98.60",
      "obsProduccio": "Tallar fi",
      "esborrat": false
    },
    {
      "id": 982,
      "ordinal": 2,
      "producte": { "id": 13, "codi": "PIC01", "descripcio": "Picada de porc" },
      "unitatsDemanades": 4,
      "kgDemanats": "0.000",
      "kgEditable": true,
      "unitatsLliurades": 0,
      "kgLliurats": "0.000",
      "confirmatA": null,
      "preuUnitari": "7.60",
      "totalLinia": "30.40",
      "obsProduccio": null,
      "esborrat": false
    }
  ]
}
```

**`POST /comandes`** — alta manual. Es el camino de los pedidos por teléfono,
correo y WhatsApp, que son la mayoría del volumen real.

```json
{
  "origen": "telefon",
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
      "num": "2026-0142",
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
      "obsLliurament": "Entregar pels matins"
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 12, "totalPagines": 1 }
}
```

> `totals` corresponde a **todo lo filtrado**, no sólo a la página visible. Es
> el bloque de subtotales que va arriba de la tabla.

---

### 4.7 · Panell Obrador

Sólo lectura. Agrupado por producto, no por pedido: al obrador el concepto de
pedido le da igual, trabaja por artículo.

**`GET /panells/obrador`**

Filtros: `?dataProduccioDes=&dataProduccioFins=&categoriaId=&tipus=`

```json
{
  "totals": {
    "linies": 34,
    "totalUnitats": 187,
    "totalKg": "142.300"
  },
  "dades": [
    {
      "producteId": 12,
      "codi": "LLF01",
      "producte": "Llom fresc de porc",
      "tipus": "simple",
      "categoria": "Fresc",
      "dataProduccio": "2026-08-16T00:00:00Z",
      "dataExpedicio": "2026-08-17T00:00:00Z",
      "dataLliurament": "2026-08-18T00:00:00Z",
      "unitats": 42,
      "kg": "52.500",
      "obsProduccio": "Tallar fi",
      "obsLliurament": null
    }
  ],
  "paginacio": { "pagina": 1, "mida": 50, "total": 34, "totalPagines": 1 }
}
```

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
      "num": "2026-0142",
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

| Tema                                     | Estado                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Campos de agrupación del catálogo        | Se definen en la reunión del lunes                                                          |
| Panell Producció y Rendiments Porcs      | El cliente no los cerró. No se construyen                                                   |
| Descuentos                               | El 45 % de los pedidos web llevan cupón, pero quedaron fuera de esta versión. Sin confirmar |
| Asignación de transportista              | Sin criterio definido                                                                       |
| Si el sistema es bilingüe o sólo catalán | Sin confirmar                                                                               |

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
