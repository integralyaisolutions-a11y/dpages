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
 */
export interface RendimentPorcApi {
  id: number;
  producte: { id: number; codi: string | null; descripcio: string };
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

/** `POST /clients` — alta manual (teléfono/WhatsApp no traen cliente de WooCommerce que resolver). */
export interface ClientCreacioApi {
  codi: string;
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
  unitatsDemanades: number;
  kgDemanats: string;
  kgEditable: boolean;
  unitatsLliurades: number;
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
}

export interface ComandaCreacioApi {
  origen: string;
  clientId?: number;
  dataLliurament?: string;
  transportistaId?: number;
  obsLliurament?: string;
  linies: LiniaCreacioApi[];
}

// ── 5 · Empaquetado ──────────────────────────────────────────────────────

export interface LliuramentBodyApi {
  unitatsLliurades: number;
  kgLliurats: string;
}

export interface LliuramentRespostaApi {
  liniaId: number;
  comandaId: number;
  unitatsLliurades: number;
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
  linies: number;
  totalKg: string;
  totalEur: string;
  obsProduccio: string | null;
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
  totalUnitats: number;
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
  unitats: number;
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
  unitatsDemanades: number;
  unitatsLliurades: number;
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
  unitatsDemanades: number;
  kgDemanats: string;
  unitatsLliurades: number;
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
 */
export interface PanellProduccioFilaApi {
  agrupacioRendiment: string;
  categoria: string;
  agrupacioProduccio: string;
  producte: { id: number; descripcio: string };
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
