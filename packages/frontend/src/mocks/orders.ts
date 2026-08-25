import type { ComandaDetallApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

function sumKg(lines: ComandaDetallApi["linies"]): string {
  return lines.reduce((sum, line) => sum + Number(line.kgDemanats), 0).toFixed(3);
}

function sumEur(lines: ComandaDetallApi["linies"]): string {
  return lines.reduce((sum, line) => sum + Number(line.totalLinia), 0).toFixed(2);
}

const order1Lines: ComandaDetallApi["linies"] = [
  {
    id: 1,
    ordinal: 1,
    producte: { id: 6, codi: "CTLLTATN", descripcio: "COSTELLETA" },
    categoria: "PECES NOBLES KG",
    format: "TALLAT",
    envasat: "NORMAL",
    unitatsDemanades: 35,
    kgDemanats: "17.500",
    kgEditable: false,
    unitatsLliurades: 30,
    kgLliurats: "16.000",
    confirmatA: "2026-08-16T10:00:00Z",
    preuUnitari: "12.50",
    totalLinia: "437.50",
    dataProduccio: "2026-08-14T06:00:00Z",
    obsProduccio: "",
    esborrat: false,
  },
  {
    id: 2,
    ordinal: 2,
    producte: { id: 7, codi: "HAMTN2", descripcio: "HAMBURGUESA" },
    categoria: "ELABORAT FRESC",
    format: "TALLAT",
    envasat: "NORMAL",
    unitatsDemanades: 35,
    kgDemanats: "8.750",
    kgEditable: false,
    unitatsLliurades: 0,
    kgLliurats: "0.000",
    confirmatA: null,
    preuUnitari: "6.80",
    totalLinia: "238.00",
    dataProduccio: "2026-08-14T06:00:00Z",
    obsProduccio: "cortar fino",
    esborrat: false,
  },
];

const order2Lines: ComandaDetallApi["linies"] = [
  {
    id: 3,
    ordinal: 1,
    producte: { id: 1, codi: "BOTNGTE", descripcio: "BOTIFARRA NEGRA" },
    categoria: "ELABORAT CUIT",
    format: "TALLAT",
    envasat: "ESPECIAL",
    unitatsDemanades: 10,
    kgDemanats: "12.000",
    kgEditable: false,
    unitatsLliurades: 0,
    kgLliurats: "0.000",
    confirmatA: null,
    preuUnitari: "3.11",
    totalLinia: "31.10",
    // Data de producció confirmada per l'spec original; la resta de la línia
    // (unitats/producte) és de farciment, no confirmat amb el client.
    dataProduccio: "2026-08-20T06:00:00Z",
    obsProduccio: "",
    esborrat: false,
  },
  {
    id: 4,
    ordinal: 2,
    producte: { id: 7, codi: "HAMTN2", descripcio: "HAMBURGUESA" },
    categoria: "ELABORAT FRESC",
    format: "TALLAT",
    envasat: "NORMAL",
    unitatsDemanades: 5,
    kgDemanats: "1.250",
    kgEditable: false,
    unitatsLliurades: 0,
    kgLliurats: "0.000",
    confirmatA: null,
    preuUnitari: "6.80",
    totalLinia: "34.00",
    dataProduccio: "2026-08-21T06:00:00Z",
    obsProduccio: "",
    esborrat: false,
  },
];

let orders: ComandaDetallApi[] = [
  {
    id: 1,
    num: "000073",
    origen: "manual",
    estat: "oberta",
    client: { id: 3, nom: "Carnisseria Puig", poblacio: "Olot" },
    tarifa: { id: 3, nom: "CCAA" },
    transportista: { id: 1, nom: "DHL" },
    poblacioDesti: "Barcelona",
    adrecaLliurament: "Calle Mayor 12, Madrid",
    dataComanda: "2026-08-10T00:00:00Z",
    dataProduccio: null,
    dataExpedicio: "2026-08-16T00:00:00Z",
    dataLliurament: "2026-08-17T00:00:00Z",
    bultos: 1,
    obsProduccio: "",
    obsLliurament: "",
    totalKg: sumKg(order1Lines),
    totalEur: sumEur(order1Lines),
    congelada: false,
    congelatA: null,
    linies: order1Lines,
    incidencies: [],
  },
  {
    id: 2,
    num: "000074",
    origen: "manual",
    estat: "amb_incidencia",
    client: { id: 6, nom: "Hotel Costa Azul", poblacio: null },
    tarifa: { id: 3, nom: "CCAA" },
    transportista: { id: 2, nom: "Nacex" },
    poblacioDesti: "Sabadell",
    // adreça: no confirmada en la data que em vau passar.
    adrecaLliurament: "",
    dataComanda: "2026-08-18T00:00:00Z",
    dataProduccio: null,
    dataExpedicio: null,
    dataLliurament: "2026-08-25T00:00:00Z",
    bultos: 1,
    obsProduccio: "",
    obsLliurament: "",
    totalKg: sumKg(order2Lines),
    totalEur: sumEur(order2Lines),
    congelada: false,
    congelatA: null,
    linies: order2Lines,
    incidencies: [
      {
        tipus: "article_no_resolt",
        // Motiu de farciment: no confirmat amb el client, només les dates de
        // producció (20/08 i 21/08) venen de l'spec original.
        detall: "Motiu de farciment, no confirmat.",
        creatA: "2026-08-18T09:00:00Z",
      },
    ],
  },
];

let nextOrderId = orders.length + 1;

export function getMockOrders(): Promise<ComandaDetallApi[]> {
  return mockRequest(orders);
}

export function addMockOrder(order: Omit<ComandaDetallApi, "id">): Promise<ComandaDetallApi[]> {
  orders = [...orders, { id: nextOrderId++, ...order }];
  return mockRequest(orders);
}

export function updateMockOrder(num: string, order: ComandaDetallApi): Promise<ComandaDetallApi[]> {
  orders = orders.map((item) => (item.num === num ? order : item));
  return mockRequest(orders);
}

export function nextMockOrderNumber(): string {
  const max = orders.reduce((highest, order) => Math.max(highest, Number(order.num)), 0);
  return String(max + 1).padStart(6, "0");
}
