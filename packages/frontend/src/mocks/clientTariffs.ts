import type { ClientApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

// `tarifa` referencia por {id, nom} las mismas tarifas que mocks/rates.ts
// (tariffColumns) — sin import directo, igual que el resto de los mocks
// (AUDITORIA_FRONTEND.md §4: el join es por coincidencia de dato, no FK real).
let clientTariffs: ClientApi[] = [
  {
    id: 1,
    codi: "C-0021",
    nom: "Botiga Gourmet Sitges",
    nif: null,
    email: null,
    telefon: null,
    poblacio: "Sitges",
    tarifa: { id: 7, nom: "WEB+PART" },
    transportistaDefecte: null,
    actiu: true,
  },
  {
    id: 2,
    codi: "C-0012",
    nom: "Cansaladeria Vall",
    nif: null,
    email: null,
    telefon: null,
    poblacio: "Ripoll",
    tarifa: { id: 2, nom: "CATALUNYA" },
    transportistaDefecte: null,
    actiu: true,
  },
  {
    id: 3,
    codi: "C-0011",
    nom: "Carnisseria Puig",
    nif: null,
    email: null,
    telefon: null,
    poblacio: "Olot",
    tarifa: { id: 6, nom: "SARGAIRE" },
    transportistaDefecte: null,
    actiu: true,
  },
  {
    id: 4,
    codi: "C-0009",
    nom: "Cash & Carry Levante",
    nif: null,
    email: null,
    telefon: null,
    poblacio: "Vic",
    tarifa: { id: 6, nom: "SARGAIRE" },
    transportistaDefecte: null,
    actiu: true,
  },
  {
    id: 5,
    codi: "C-0024",
    nom: "Cash Ponent",
    nif: null,
    email: null,
    telefon: null,
    poblacio: "Balaguer",
    tarifa: { id: 3, nom: "CCAA" },
    transportistaDefecte: null,
    actiu: true,
  },
  {
    id: 6,
    codi: "C-0030",
    nom: "Hotel Costa Azul",
    nif: null,
    email: null,
    telefon: null,
    poblacio: null,
    tarifa: { id: 3, nom: "CCAA" },
    transportistaDefecte: null,
    actiu: true,
  },
];

let nextClientId = clientTariffs.length + 1;

export function getMockClientTariffs(): Promise<ClientApi[]> {
  return mockRequest(clientTariffs);
}

export function addMockClient(client: Omit<ClientApi, "id">): Promise<ClientApi[]> {
  clientTariffs = [...clientTariffs, { id: nextClientId++, ...client }];
  return mockRequest(clientTariffs);
}

export function updateMockClient(codi: string, client: ClientApi): Promise<ClientApi[]> {
  clientTariffs = clientTariffs.map((item) => (item.codi === codi ? client : item));
  return mockRequest(clientTariffs);
}
