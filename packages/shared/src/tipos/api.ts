/**
 * Formas de request/response de la API de negocio (docs/contrato-api.md,
 * capa 8) — lo que consume Michel en el frontend. Deliberadamente
 * DISTINTAS de los tipos de dominio en catalog.ts/comanda.ts/client.ts:
 * esos reflejan filas de la base (UUID, snake_case implícito vía nombres
 * de columna); estos reflejan el JSON exacto del contrato (enteros
 * secuenciales, camelCase, decimales como string).
 *
 * Por qué los `id` son `number` y no `string`: el contrato usa enteros
 * pequeños en todos sus ejemplos ("id": 12, "id": 142...) — Michel los
 * copia tal cual a sus mocks. Las claves primarias internas siguen siendo
 * UUID (no cambia nada del sync ni de las FK); cada tabla expuesta por API
 * tiene además una columna `id_seq` de sólo lectura para esto (ver
 * migración 0008 y ADR-019).
 */

export interface Paginacio {
  pagina: number;
  mida: number;
  total: number;
  totalPagines: number;
}

export interface RespostaPaginada<T> {
  dades: T[];
  paginacio: Paginacio;
}

/** Referencia liviana a otra entidad ({id, nom}) — usada dentro de otra respuesta, no en el listado propio de esa entidad. */
export interface ReferenciaApi {
  id: number;
  nom: string;
}

export type CodiErrorApi =
  'VALIDACIO' | 'NO_AUTENTICAT' | 'SENSE_PERMIS' | 'NO_TROBAT' | 'CONFLICTE' | 'ERROR_INTERN';

export interface DetallErrorApi {
  camp: string;
  missatge: string;
}

export interface CosErrorApi {
  error: {
    codi: CodiErrorApi;
    missatge: string;
    detalls?: DetallErrorApi[];
  };
}

// ── 4.1 · Categories ────────────────────────────────────────────────────

export interface CategoriaApi {
  id: number;
  nom: string;
  elaboratPorc: boolean;
  /** `null` sólo cuando `elaboratPorc` es `false` — regla de negocio, no falta de dato. */
  agrupacioRendiment: 'KG' | 'MAGRE' | 'PAQ' | null;
}

// ── 4.2 · Catàleg de productes ──────────────────────────────────────────

export interface CategoriaResumApi {
  id: number;
  nom: string;
}

export interface ProducteApi {
  id: number;
  codi: string | null;
  descripcio: string;
  descripcioVenda: string | null;
  tipus: 'simple' | 'variable';
  /** Null = artículo "a medida" (sin peso de ficha) — funcional, no un error. */
  pesKg: string | null;
  preuVenda: string | null;
  actiu: boolean;
  categoria: CategoriaResumApi | null;
  /** Texto libre: agrupa varios códigos bajo una misma familia lógica de producción. Null si no aplica. */
  agrupacioProduccio: string | null;
  format: 'SENCER' | 'TALLAT' | 'LLESCAT' | null;
  envasat: 'NORMAL' | 'NORMAL (pes)' | 'NORMAL (web)' | 'ESPECIAL' | null;
}

// ── 4.2b · Rendiments Porcs ──────────────────────────────────────────────

/**
 * Ficha de rendimiento por producto: cuántas unidades salen de un cerdo y
 * cuánto pesa cada una — la base del cálculo del Panell Producció (KG,
 * PAQ, MAGRE). `agrupacioRendiment`, `categoria` y `agrupacioProduccio`
 * son de sólo lectura acá: se derivan del producto/categoría asociados,
 * no se editan en este CRUD.
 *
 * BREAKING (capa 22): ya no trae `producte` — Francesc sacó esa columna de
 * la pantalla (con datos reales, no aporta nada que `agrupacioProduccio`
 * no diga mejor). `producteId` sigue existiendo como campo de ENTRADA del
 * alta/edición (`POST /rendiments-porcs`, ver más abajo) — sólo se sacó de
 * la respuesta.
 */
export interface RendimentPorcApi {
  id: number;
  /** Derivado de producte.categoria.agrupacioRendiment — sólo lectura. */
  agrupacioRendiment: string;
  /** Derivado de producte.categoria.nom — sólo lectura. */
  categoria: string;
  /** Derivado de producte.agrupacioProduccio — sólo lectura. */
  agrupacioProduccio: string | null;
  /** NUMERIC como string, mismo criterio que pesKg. */
  unitatsPerPorc: string;
  kgPerUnitat: string;
  /** Calculado = unitatsPerPorc × kgPerUnitat. */
  pesTotal: string;
}

export interface RendimentPorcEntradaApi {
  producteId: number;
  unitatsPerPorc: string;
  kgPerUnitat: string;
}

// ── 4.3 · Llistat de tarifes ─────────────────────────────────────────────

export interface FilaMatriuTarifesApi {
  producteId: number;
  codi: string | null;
  descripcio: string;
  /** Claves = id de tarifa en texto. Null = ese artículo no tiene precio en esa tarifa. */
  preus: Record<string, string | null>;
}

/** A diferencia de ReferenciaApi: esto es el listado propio de tarifa, así que trae su codi. */
export interface TarifaResumApi {
  id: number;
  codi: string | null;
  nom: string;
}

export interface MatriuTarifesApi {
  tarifes: TarifaResumApi[];
  dades: FilaMatriuTarifesApi[];
  paginacio: Paginacio;
}

// ── 4.4 · Tarifes per client ─────────────────────────────────────────────

export interface ClientApi {
  id: number;
  /**
   * Autogenerado siempre (`CLI` + `id`, sin padding fijo) — capa 25 para
   * clientes de WooCommerce, capa 29 para alta manual (`POST /clients`).
   * De sólo lectura para siempre: ningún endpoint lo acepta como entrada
   * editable, ni al crear ni en `PATCH /clients/:id` después. El tipo
   * sigue siendo `string | null` por los clientes cargados antes de la
   * capa 25 (backfill ya corrido en local/producción, pero el tipo no
   * fuerza esa garantía histórica).
   */
  codi: string | null;
  nom: string | null;
  nif: string | null;
  email: string | null;
  telefon: string | null;
  poblacio: string | null;
  tarifa: ReferenciaApi | null;
  transportistaDefecte: ReferenciaApi | null;
  actiu: boolean;
}

/**
 * `POST /clients` — alta manual (teléfono/WhatsApp no traen cliente de
 * WooCommerce que resolver).
 *
 * Capa 29: `codi` NO va acá — se autogenera siempre (`CLI` + `id`), igual
 * que ya hacía el sync de WooCommerce desde la capa 25. Es de sólo lectura
 * para siempre, en los dos orígenes por igual (ver `ClientApi.codi`);
 * ningún endpoint lo acepta como entrada, ni al crear ni después.
 */
export interface ClientCreacioApi {
  nom: string;
  poblacio: string;
  tarifaId?: number;
  email?: string;
  telefon?: string;
  nif?: string;
}

export interface TransportistaApi {
  id: number;
  /** Texto libre, nemotécnico, definido por el usuario al dar de alta — ej. "TR-DHL". */
  codi: string | null;
  nom: string;
  actiu: boolean;
}

// ── 4.4b · Orígens de comanda ────────────────────────────────────────────

/**
 * `origen_comanda` como tabla mantenible (confirmado 18/08/2026), no un
 * enum fijo — de ahí el CRUD completo. `codi` es el valor que aparece en
 * `ComandaResumApi.origen`/`ComandaDetallApi.origen` (hoy "woocommerce" y
 * "manual"; extensible a futuro sin tocar código, ej. "whatsapp").
 */
export interface OrigenComandaApi {
  id: number;
  codi: string;
  nom: string;
  actiu: boolean;
}

export interface OrigenComandaEntradaApi {
  codi: string;
  nom: string;
  actiu?: boolean;
}

// ── 4.5 · Comandes ───────────────────────────────────────────────────────

export interface ComandaResumApi {
  id: number;
  num: string;
  /** `OrigenComandaApi.codi` (hoy "woocommerce" o "manual") — extensible sin tocar código, ver sección 3 del contrato. */
  origen: string;
  estat: string;
  client: { id: number; nom: string; poblacio: string | null } | null;
  tarifa: ReferenciaApi | null;
  transportista: ReferenciaApi | null;
  poblacioDesti: string | null;
  /** Dirección de entrega en texto libre — distinta de poblacioDesti (sólo población/ciudad). */
  adrecaLliurament: string | null;
  dataComanda: string;
  dataProduccio: string | null;
  /**
   * Capa 21 — fechas de producción DISTINTAS entre las líneas del pedido
   * (`comanda_linia.dataProduccio`, ver `ComandaLiniaApi.dataProduccio`),
   * ordenadas cronológicamente, sin nulls. Array vacío si ninguna línea
   * tiene fecha de producción propia. Distinto de `dataProduccio` (arriba,
   * la de la CABECERA del pedido) — un pedido puede mostrar varias fechas
   * acá si sus líneas se producen en días distintos (visto en el demo:
   * "20/08/2026, 21/08/2026"). ISO-8601 UTC, igual que el resto de las
   * fechas del contrato — el formateo/unión con coma lo hace el frontend.
   */
  datesProduccioLinies: string[];
  dataExpedicio: string | null;
  dataLliurament: string | null;
  bultos: number | null;
  totalLinies: number;
  totalKg: string;
  totalEur: string;
  congelada: boolean;
  /** 0 si no tiene ninguna incidencia. Pensado para una tabla con cientos de filas — el detalle completo está en ComandaDetallApi.incidencies. */
  totalIncidencies: number;
  /** El `tipus` cuando todas las incidencias comparten el mismo; `null` si no hay ninguna o si hay de más de un tipo. */
  tipusIncidencia: string | null;
}

export interface ComandaLiniaApi {
  id: number;
  ordinal: number;
  producte: { id: number; codi: string | null; descripcio: string } | null;
  /**
   * Capa 20 — mismos tres campos que ya devuelve `FilaPanellObradorApi`
   * para esta misma línea (`GET /panells/obrador`), resueltos igual
   * (join contra `producte`/`categoria_producte`): consistencia entre
   * ambos endpoints. `null` cuando `producte` también es `null`.
   */
  categoria: string | null;
  format: string | null;
  envasat: string | null;
  /**
   * Capa 38 — BREAKING: pasó de `number` a `string`. La columna
   * (`comanda_linia.unitats_demanades`) cambió de INTEGER a NUMERIC(10,2)
   * (permite entregas/pedidos parciales de pieza, ej. 2.5 unidades) — `pg`
   * siempre devuelve NUMERIC como string, igual que ya pasa con
   * `kgDemanats`/`preuUnitari`. El body de entrada sigue aceptando un JS
   * number normal (`LiniaCreacioApi`/`LiniaEdicioApi`); sólo cambió la
   * salida.
   */
  unitatsDemanades: string;
  kgDemanats: string;
  kgEditable: boolean;
  /** Capa 38 — mismo cambio que unitatsDemanades, misma razón (NUMERIC(10,2)). */
  unitatsLliurades: string;
  kgLliurats: string;
  confirmatA: string | null;
  /**
   * Cascada de resolución de precio, en este orden: 1) la tarifa asignada
   * al cliente del pedido para este producto (`tarifa_preu`); 2) si no
   * hay, el precio base del producto (`ProducteApi.preuVenda`); 3) si
   * tampoco hay ninguno de los dos, queda en `"0.00"` y se registra una
   * incidencia — nunca una línea sin precio silenciosa.
   */
  preuUnitari: string;
  totalLinia: string;
  /** Editable por línea (prototipo /pedidos), distinta de comanda.dataProduccio (cabecera). */
  dataProduccio: string | null;
  obsProduccio: string | null;
  esborrat: boolean;
}

/** Una fila de `incidencia_comanda` — el motivo detrás de `estat: "amb_incidencia"`. */
export interface IncidenciaComandaApi {
  tipus: string;
  detall: string;
  creatA: string;
}

export interface ComandaDetallApi {
  id: number;
  num: string;
  /** `OrigenComandaApi.codi` (hoy "woocommerce" o "manual") — extensible sin tocar código, ver sección 3 del contrato. */
  origen: string;
  estat: string;
  client: { id: number; nom: string; poblacio: string | null } | null;
  tarifa: ReferenciaApi | null;
  transportista: ReferenciaApi | null;
  poblacioDesti: string | null;
  adrecaLliurament: string | null;
  dataComanda: string;
  dataProduccio: string | null;
  dataExpedicio: string | null;
  dataLliurament: string | null;
  bultos: number | null;
  obsProduccio: string | null;
  obsLliurament: string | null;
  totalKg: string;
  totalEur: string;
  congelada: boolean;
  congelatA: string | null;
  linies: ComandaLiniaApi[];
  /** Vacío si `estat` no es `"amb_incidencia"`. Ordenado del más antiguo al más nuevo. */
  incidencies: IncidenciaComandaApi[];
}

export interface LiniaCreacioApi {
  producteId: number;
  unitatsDemanades: number;
  /** Sólo tiene sentido si el artículo es "a medida" — se ignora si tiene peso de ficha. */
  kgDemanats?: string;
  /**
   * Capa 34. Opcional. Se valida contra las fechas de cabecera del pedido
   * (las 6 reglas de coherencia temporal, ver docs/contrato-api.md § 4.5) —
   * en `POST /comandes` sólo contra `dataLliurament` (única fecha de
   * cabecera que existe en ese body); en
   * `POST /comandes/:comandaId/linies` contra las 3 fechas de cabecera ya
   * guardadas del pedido.
   */
  dataProduccio?: string | null;
}

export interface ComandaCreacioApi {
  origen: string;
  clientId?: number;
  /**
   * Capa 32. Si viene, anula la tarifa del cliente SÓLO para resolver el
   * precio de las líneas de esta alta — se guarda en `comanda.tarifaId`.
   * Editarlo después vía `PATCH /comandes/:id` NO recalcula estas líneas.
   */
  tarifaId?: number;
  dataLliurament?: string;
  transportistaId?: number;
  obsLliurament?: string;
  linies: LiniaCreacioApi[];
}

/**
 * Capa 30 — `POST /comandes/:comandaId/linies` (agregar línea a un pedido
 * ya creado). Mismo shape que `LiniaCreacioApi`: la resolución de precio
 * usa la misma cascada que al crear el pedido (tarifa del cliente →
 * precio de catálogo → "0.00" + incidencia).
 */
export type LiniaAfegidaApi = LiniaCreacioApi;

/**
 * Capa 30 — `PATCH /comandes/:comandaId/linies/:liniaId` (editar línea
 * existente). Todos opcionales, actualiza sólo lo que venga. NO incluye
 * `preuUnitari`: editar cantidades nunca re-resuelve el precio, sólo
 * recalcula `totalLinia` con el `preuUnitari` ya asignado — si hace falta
 * re-resolver precio a propósito, es una acción separada.
 */
export interface LiniaEdicioApi {
  unitatsDemanades?: number;
  /** Sólo aceptado si el artículo es "a medida" (`kgEditable: true`) — rechaza si el artículo tiene ficha de peso. */
  kgDemanats?: string;
  dataProduccio?: string | null;
  obsProduccio?: string | null;
}

// ── 5 · Empaquetado ──────────────────────────────────────────────────────

export interface LliuramentBodyApi {
  /** Entrada: sigue siendo un JS number normal, admite hasta 2 decimales (capa 38). */
  unitatsLliurades: number;
  kgLliurats: string;
}

export interface LliuramentRespostaApi {
  liniaId: number;
  comandaId: number;
  /** Capa 38 — BREAKING: pasó de `number` a `string`, ver ComandaLiniaApi.unitatsDemanades. */
  unitatsLliurades: string;
  kgLliurats: string;
  confirmatA: string;
  /**
   * Firebase Auth llega en una capa posterior (ver docs/decisiones-arquitectura.md).
   * Mientras tanto, en modo desarrollo sin token, este id/nom son un valor
   * fijo — no representan un usuario real todavía.
   */
  confirmatPer: { id: number; nom: string };
}

// ── 4.6 · Panell Oficina ─────────────────────────────────────────────────

export interface TotalsPanellOficinaApi {
  comandes: number;
  linies: number;
  totalKg: string;
  totalEur: string;
}

export interface FilaPanellOficinaApi {
  comandaId: number;
  num: string;
  client: string | null;
  poblacioDesti: string | null;
  tarifa: string | null;
  transportista: string | null;
  estat: string;
  dataComanda: string;
  dataExpedicio: string | null;
  dataLliurament: string | null;
  /** Capa 35. */
  bultos: number | null;
  linies: number;
  totalKg: string;
  totalEur: string;
  /**
   * Capa 35 — BREAKING: antes era el texto de `comanda.obsProduccio`
   * (`string | null`); ahora es un booleano ("¿hay algo que ver?", para el
   * checkbox del panel) que sale `true` si la cabecera tiene contenido O
   * alguna línea activa (no esborrada) tiene `obsProduccio` propio — antes
   * una observación cargada sólo en una línea era invisible acá.
   */
  obsProduccio: boolean;
  /**
   * Sin cambios (capa 35): sigue siendo el texto de `comanda.obsLliurament`.
   * `comanda_linia` no tiene una columna `obsLliurament` a nivel de línea —
   * no hay nada más que revisar acá.
   */
  obsLliurament: string | null;
  /** Mismo criterio que ComandaResumApi — resumen liviano, no el detalle completo. */
  totalIncidencies: number;
  tipusIncidencia: string | null;
}

export interface PanellOficinaApi {
  totals: TotalsPanellOficinaApi;
  dades: FilaPanellOficinaApi[];
  paginacio: Paginacio;
}

// ── 4.7 · Panell Obrador ─────────────────────────────────────────────────

export interface TotalsPanellObradorApi {
  linies: number;
  /** Capa 38 — BREAKING: pasó de `number` a `string`, mismo motivo/criterio que `totalKg` (SUM de NUMERIC(10,2), ver ComandaLiniaApi.unitatsDemanades). */
  totalUnitats: string;
  totalKg: string;
}

/**
 * Confirmado con el cliente el 18/08/2026 (prototipo + reunión): Obrador
 * muestra líneas de pedido INDIVIDUALES, sin agrupar por producto —
 * reemplaza la forma agregada anterior. `TotalsPanellObradorApi` no
 * cambia: linies/totalUnitats/totalKg siguen siendo válidos sobre líneas
 * individuales.
 */
export interface FilaPanellObradorApi {
  liniaId: number;
  comandaId: number;
  producte: { id: number; codi: string | null; descripcio: string };
  categoria: string | null;
  format: string | null;
  envasat: string | null;
  client: string | null;
  dataProduccio: string | null;
  /** Capa 38 — BREAKING: pasó de `number` a `string` (`comanda_linia.unitats_demanades`, ver ComandaLiniaApi.unitatsDemanades). */
  unitats: string;
  kg: string;
  obsProduccio: string | null;
}

export interface PanellObradorApi {
  totals: TotalsPanellObradorApi;
  dades: FilaPanellObradorApi[];
  paginacio: Paginacio;
}

// ── 4.8 · Panell Empaquetat ──────────────────────────────────────────────

export interface TotalsPanellEmpaquetatApi {
  linies: number;
  /** Capa 38 — BREAKING: pasó de `number` a `string`, mismo motivo/criterio que `kgDemanats` (SUM de NUMERIC(10,2), ver ComandaLiniaApi.unitatsDemanades). */
  unitatsDemanades: string;
  /** Capa 38 — BREAKING: mismo cambio que unitatsDemanades. */
  unitatsLliurades: string;
  kgDemanats: string;
  kgLliurats: string;
  liniesConfirmades: number;
  liniesPendents: number;
}

export interface FilaPanellEmpaquetatApi {
  liniaId: number;
  comandaId: number;
  num: string;
  dataExpedicio: string | null;
  dataLliurament: string | null;
  transportista: string | null;
  client: string | null;
  codi: string | null;
  producte: string;
  /** Capa 38 — BREAKING: pasó de `number` a `string` (ver ComandaLiniaApi.unitatsDemanades). */
  unitatsDemanades: string;
  kgDemanats: string;
  /** Capa 38 — BREAKING: mismo cambio que unitatsDemanades. */
  unitatsLliurades: string;
  kgLliurats: string;
  confirmatA: string | null;
  confirmatPer: string | null;
}

export interface PanellEmpaquetatApi {
  totals: TotalsPanellEmpaquetatApi;
  dades: FilaPanellEmpaquetatApi[];
  paginacio: Paginacio;
}

// ── 4.9 · Panell Producció ────────────────────────────────────────────────

/**
 * Una fila por producto con demanda en el rango filtrado. Las tres
 * fórmulas (KG, PAQ, MAGRE) conviven en la misma tabla — por eso varios
 * campos son excluyentes entre sí según `agrupacioRendiment`, ver
 * docs/contrato-api.md ("Panell Producció") para los ejemplos numéricos
 * verificados contra el prototipo:
 * - `agrupacioRendiment: "KG"` → sólo `kgAElaborar` (paqPedido null).
 * - `agrupacioRendiment: "PAQ"` → sólo `paqPedido` (kgAElaborar null).
 * - `agrupacioRendiment: "MAGRE"` → `rendiment`/`diferencia` van al total
 *   global de `PanellProduccioApi.totals`, no por línea (ambos null acá).
 *
 * BREAKING (capa 22): ya no trae `producte` — cada fila es una AGRUPACIÓN
 * de producción, que puede tener varios artículos asociados; mostrar sólo
 * uno (el de `id` más chico, elegido de forma determinística) confundía
 * más de lo que ayudaba con datos reales. Francesc lo sacó de la pantalla.
 * El filtro `?producte=` de `GET /panells/produccio` sigue existiendo —
 * esto sólo afecta la RESPUESTA, no la capacidad de filtrar por artículo.
 */
export interface PanellProduccioFilaApi {
  agrupacioRendiment: string;
  categoria: string;
  agrupacioProduccio: string;
  /** Null cuando la agrupación es KG o MAGRE (no aplica). */
  paqPedido: string | null;
  /** Null cuando la agrupación es PAQ. */
  kgAElaborar: string | null;
  /** Null en filas MAGRE (van al total global, no por línea). */
  rendiment: string | null;
  /** Mismo criterio que rendiment. */
  diferencia: string | null;
}

export interface PanellProduccioApi {
  totals: {
    totalKgAElaborar: string;
    totalKgMagro: string;
    diferencia: string;
    /**
     * Capa 24 — rendimiento fijo por cerdo (jamón/recortes/paletillas),
     * confirmado por Francesc: no calculado desde `rendiments_porcs`, son
     * constantes de negocio (`KG_JAMON_PER_CERDO` × `nombrePorcs`, y así
     * para los otros dos). `nombrePorcs` es obligatorio en este endpoint
     * (ver `GET /panells/produccio`), así que estos tres campos siempre
     * traen un valor — nunca `null`.
     */
    kgJamon: string;
    kgRecortes: string;
    kgPaletillas: string;
  };
  dades: PanellProduccioFilaApi[];
  paginacio: Paginacio;
}

// ── 6 · Usuaris i rols ────────────────────────────────────────────────────

/**
 * Un rol define qué módulos de la aplicación puede ver el usuario — no
 * restringe acciones dentro de un módulo (ver ADR-021: ningún endpoint de
 * negocio bloquea por rol todavía; `modulsPermesos` es lo que el
 * FRONTEND usa para decidir qué mostrar en el menú).
 */
export interface RolApi {
  id: number;
  nom: string;
  /** Claves de módulo, ej. ["categories", "catalog", "tarifes", "clients", "comandes", "panells", "produccio", "usuaris"]. */
  modulsPermesos: string[];
}

export interface RolEntradaApi {
  nom: string;
  modulsPermesos: string[];
}

export interface UsuariApi {
  id: number;
  /** uid de Firebase Auth — vínculo con el token, ver ADR-021. */
  firebaseUid: string;
  nom: string;
  email: string;
  /**
   * `modulsPermesos` viaja acá (no sólo en RolApi) porque GET /jo (capa 17)
   * es lo primero que llama el frontend al iniciar sesión, y necesita saber
   * qué mostrar sin una segunda llamada a GET /rols/:id.
   */
  rol: { id: number; nom: string; modulsPermesos: string[] };
  actiu: boolean;
}

export interface UsuariEntradaApi {
  firebaseUid: string;
  nom: string;
  email: string;
  rolId: number;
  actiu?: boolean;
}

/**
 * `POST /usuaris` (capa 19) — alta manual por un Administrador. A
 * diferencia de `UsuariEntradaApi`, no lleva `firebaseUid`: lo genera el
 * backend al crear el usuario en Firebase, no lo elige quien da de alta.
 */
export interface UsuariCreacioApi {
  nom: string;
  email: string;
  rolId: number;
}

/**
 * Respuesta de `POST /usuaris`. El backend no envía ningún email — genera
 * `linkEstabliment` (Firebase `generatePasswordResetLink`, de un solo uso)
 * y lo devuelve para que el Administrador se lo comparta a mano por el
 * canal que use (WhatsApp, email personal...).
 */
export interface UsuariCreatRespostaApi {
  usuari: UsuariApi;
  linkEstabliment: string;
}
