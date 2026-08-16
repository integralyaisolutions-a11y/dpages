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
  /** Siempre null por ahora — campo de agrupación pendiente (contrato, sección 7). */
  agrupacioRendiment: string | null;
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
  nom: string;
  actiu: boolean;
}

// ── 4.5 · Comandes ───────────────────────────────────────────────────────

export interface ComandaResumApi {
  id: number;
  num: string;
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

export interface FilaPanellObradorApi {
  producteId: number;
  codi: string | null;
  producte: string;
  tipus: string;
  categoria: string | null;
  dataProduccio: string | null;
  dataExpedicio: string | null;
  dataLliurament: string | null;
  unitats: number;
  kg: string;
  obsProduccio: string | null;
  obsLliurament: string | null;
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
