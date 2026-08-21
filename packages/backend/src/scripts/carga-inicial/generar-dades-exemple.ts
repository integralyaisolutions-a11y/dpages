/**
 * Genera los tres .xlsx de ejemplo en entrada/ — SIMULACIÓN de la capa 18,
 * no el Excel real del cliente (que todavía no llegó). Sirve para probar
 * de punta a punta que el mecanismo de importación funciona, con datos de
 * mentira pero con la forma correcta. Se puede volver a correr en
 * cualquier momento para regenerar los tres archivos desde cero.
 *
 * Las 8 categorías que usa "articles-exemple.xlsx" son las sembradas por
 * seed-arranque.ts (capa 13) — si esos nombres cambian ahí, hay que
 * actualizarlos acá también.
 *
 * Uso: tsx --env-file-if-exists=../../.env src/scripts/carga-inicial/generar-dades-exemple.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_ENTRADA = path.join(__dirname, 'entrada');

interface FilaArticle {
  codi: string;
  descripcio: string;
  categoria: string;
  agrupacioProduccio: string | null;
  format: string | null;
  envasat: string;
  pesKg: number | null;
  preuVenda: number;
}

// 15 artículos de mentira, con forma realista — 3 con pesKg null a
// propósito (SECR01, MAGR01, FETGE01), para probar el caso "a mida".
const ARTICLES: FilaArticle[] = [
  {
    codi: 'LLF01',
    descripcio: 'Llom fresc de porc',
    categoria: 'PECES NOBLES KG',
    agrupacioProduccio: 'LLOM',
    format: 'SENCER',
    envasat: 'NORMAL (pes)',
    pesKg: 1.25,
    preuVenda: 9.86,
  },
  {
    codi: 'COST01',
    descripcio: 'Costelleta de porc',
    categoria: 'PECES NOBLES KG',
    agrupacioProduccio: 'COSTELLETA',
    format: 'TALLAT',
    envasat: 'NORMAL (pes)',
    pesKg: 0.8,
    preuVenda: 7.5,
  },
  {
    codi: 'SECR01',
    descripcio: 'Secret de porc',
    categoria: 'PECES NOBLES PAQ',
    agrupacioProduccio: 'SECRET',
    format: 'SENCER',
    envasat: 'NORMAL',
    pesKg: null,
    preuVenda: 12.9,
  },
  {
    codi: 'PANX01',
    descripcio: 'Panxeta de porc',
    categoria: 'PECES NOBLES KG',
    agrupacioProduccio: 'PANXETA',
    format: 'TALLAT',
    envasat: 'NORMAL (pes)',
    pesKg: 1.0,
    preuVenda: 8.2,
  },
  {
    codi: 'PEUS01',
    descripcio: 'Peus de porc',
    categoria: 'PECES NOBLES PAQ',
    agrupacioProduccio: 'PEUS',
    format: 'SENCER',
    envasat: 'NORMAL',
    pesKg: 0.5,
    preuVenda: 3.1,
  },
  {
    codi: 'ORELL01',
    descripcio: 'Orella de porc',
    categoria: 'PECES NOBLES PAQ',
    agrupacioProduccio: 'ORELLA',
    format: 'SENCER',
    envasat: 'NORMAL',
    pesKg: 0.15,
    preuVenda: 2.4,
  },
  {
    codi: 'MAGR01',
    descripcio: 'Magre de porc a trossos',
    categoria: 'PECES MAGRES',
    agrupacioProduccio: null,
    format: 'TALLAT',
    envasat: 'NORMAL (pes)',
    pesKg: null,
    preuVenda: 8.9,
  },
  {
    codi: 'BOT01',
    descripcio: 'Botifarra crua',
    categoria: 'ELABORAT FRESC',
    agrupacioProduccio: 'BOTIFARRA',
    format: null,
    envasat: 'NORMAL',
    pesKg: 0.4,
    preuVenda: 6.5,
  },
  {
    codi: 'LLONG01',
    descripcio: 'Llonganissa curada',
    categoria: 'ELABORAT CURAT',
    agrupacioProduccio: null,
    format: null,
    envasat: 'NORMAL (web)',
    pesKg: 0.35,
    preuVenda: 11.2,
  },
  {
    codi: 'FUET01',
    descripcio: 'Fuet extra',
    categoria: 'ELABORAT CURAT',
    agrupacioProduccio: null,
    format: null,
    envasat: 'ESPECIAL',
    pesKg: 0.25,
    preuVenda: 9.75,
  },
  {
    codi: 'XORI01',
    descripcio: 'Xoriço picant',
    categoria: 'ELABORAT CUIT',
    agrupacioProduccio: null,
    format: null,
    envasat: 'NORMAL',
    pesKg: 0.3,
    preuVenda: 7.8,
  },
  {
    codi: 'CANS01',
    descripcio: 'Cansalada fumada',
    categoria: 'ELABORAT FUMAT',
    agrupacioProduccio: null,
    format: 'LLESCAT',
    envasat: 'NORMAL (web)',
    pesKg: 0.2,
    preuVenda: 6.9,
  },
  {
    codi: 'FETGE01',
    descripcio: 'Fetge de porc',
    categoria: 'VÍSCERES',
    agrupacioProduccio: null,
    format: null,
    envasat: 'NORMAL',
    pesKg: null,
    preuVenda: 4.5,
  },
  {
    codi: 'LLOMPI01',
    descripcio: 'Llom embotit',
    categoria: 'ELABORAT CURAT',
    agrupacioProduccio: null,
    format: 'LLESCAT',
    envasat: 'NORMAL (web)',
    pesKg: 0.3,
    preuVenda: 14.5,
  },
  {
    codi: 'PERNIL01',
    descripcio: 'Pernil dolç',
    categoria: 'ELABORAT CUIT',
    agrupacioProduccio: null,
    format: 'LLESCAT',
    envasat: 'NORMAL (web)',
    pesKg: 0.15,
    preuVenda: 5.2,
  },
];

interface FilaTarifa {
  codi: string;
  nom: string;
}

const TARIFES: FilaTarifa[] = [
  { codi: 'GEN', nom: 'General' },
  { codi: 'REST', nom: 'Restaurants' },
  { codi: 'BOT', nom: 'Botigues' },
];

interface FilaPreu {
  tarifaCodi: string;
  articleCodi: string;
  preu: number;
}

// Matriz DISPERSA a propósito: GEN tiene precio para los 15, REST sólo para
// 5, BOT sólo para 4 — deja huecos para probar que el sistema los tolera.
const PREUS: FilaPreu[] = [
  ...ARTICLES.map((a): FilaPreu => ({ tarifaCodi: 'GEN', articleCodi: a.codi, preu: a.preuVenda })),
  { tarifaCodi: 'REST', articleCodi: 'LLF01', preu: 8.9 },
  { tarifaCodi: 'REST', articleCodi: 'COST01', preu: 6.8 },
  { tarifaCodi: 'REST', articleCodi: 'SECR01', preu: 11.5 },
  { tarifaCodi: 'REST', articleCodi: 'PANX01', preu: 7.6 },
  { tarifaCodi: 'REST', articleCodi: 'PEUS01', preu: 2.8 },
  { tarifaCodi: 'BOT', articleCodi: 'LLF01', preu: 9.2 },
  { tarifaCodi: 'BOT', articleCodi: 'COST01', preu: 7.1 },
  { tarifaCodi: 'BOT', articleCodi: 'BOT01', preu: 6.0 },
  { tarifaCodi: 'BOT', articleCodi: 'XORI01', preu: 7.2 },
];

interface FilaClient {
  codi: string;
  nom: string;
  poblacio: string;
  tarifaCodi: string | null;
}

// 10 clientes, 2 sin tarifaCodi a propósito (CLI006, CLI009).
const CLIENTS: FilaClient[] = [
  { codi: 'CLI001', nom: 'Restaurant Can Fictici', poblacio: 'Manresa', tarifaCodi: 'REST' },
  { codi: 'CLI002', nom: 'Forn El Prototip', poblacio: 'Vic', tarifaCodi: 'GEN' },
  { codi: 'CLI003', nom: 'Botiga Fictícia Centre', poblacio: 'Manresa', tarifaCodi: 'BOT' },
  { codi: 'CLI004', nom: 'Restaurant La Prova', poblacio: 'Igualada', tarifaCodi: 'REST' },
  { codi: 'CLI005', nom: 'Càtering Exemple SL', poblacio: 'Barcelona', tarifaCodi: 'GEN' },
  { codi: 'CLI006', nom: 'Client sense tarifa assignada', poblacio: 'Terrassa', tarifaCodi: null },
  { codi: 'CLI007', nom: 'Hotel Fictici Muntanya', poblacio: 'Berga', tarifaCodi: 'REST' },
  { codi: 'CLI008', nom: 'Botiga Fictícia Nord', poblacio: 'Vic', tarifaCodi: 'BOT' },
  { codi: 'CLI009', nom: 'Client ocasional', poblacio: 'Manresa', tarifaCodi: null },
  { codi: 'CLI010', nom: 'Restaurant Demo Final', poblacio: 'Solsona', tarifaCodi: 'GEN' },
];

async function generarArticles(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Articles');
  hoja.columns = [
    { header: 'codi', key: 'codi' },
    { header: 'descripcio', key: 'descripcio' },
    { header: 'categoria', key: 'categoria' },
    { header: 'agrupacioProduccio', key: 'agrupacioProduccio' },
    { header: 'format', key: 'format' },
    { header: 'envasat', key: 'envasat' },
    { header: 'pesKg', key: 'pesKg' },
    { header: 'preuVenda', key: 'preuVenda' },
  ];
  for (const a of ARTICLES) hoja.addRow(a);
  await workbook.xlsx.writeFile(path.join(DIR_ENTRADA, 'articles-exemple.xlsx'));
}

async function generarTarifes(): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  const hojaTarifes = workbook.addWorksheet('Tarifes');
  hojaTarifes.columns = [
    { header: 'codi', key: 'codi' },
    { header: 'nom', key: 'nom' },
  ];
  for (const t of TARIFES) hojaTarifes.addRow(t);

  const hojaPreus = workbook.addWorksheet('Preus');
  hojaPreus.columns = [
    { header: 'tarifaCodi', key: 'tarifaCodi' },
    { header: 'articleCodi', key: 'articleCodi' },
    { header: 'preu', key: 'preu' },
  ];
  for (const p of PREUS) hojaPreus.addRow(p);

  await workbook.xlsx.writeFile(path.join(DIR_ENTRADA, 'tarifes-exemple.xlsx'));
}

async function generarClients(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Clients');
  hoja.columns = [
    { header: 'codi', key: 'codi' },
    { header: 'nom', key: 'nom' },
    { header: 'poblacio', key: 'poblacio' },
    { header: 'tarifaCodi', key: 'tarifaCodi' },
  ];
  for (const c of CLIENTS) hoja.addRow(c);
  await workbook.xlsx.writeFile(path.join(DIR_ENTRADA, 'clients-exemple.xlsx'));
}

async function main(): Promise<void> {
  await generarArticles();
  await generarTarifes();
  await generarClients();
  console.log(`Generats a ${DIR_ENTRADA}:`);
  console.log(`  articles-exemple.xlsx (${ARTICLES.length} files)`);
  console.log(`  tarifes-exemple.xlsx (${TARIFES.length} tarifes, ${PREUS.length} preus)`);
  console.log(`  clients-exemple.xlsx (${CLIENTS.length} files)`);
}

await main();
