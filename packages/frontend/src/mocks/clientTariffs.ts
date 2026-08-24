import type { ClientTariffApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

let clientTariffs: ClientTariffApi[] = [
  { code: "C-0021", name: "Botiga Gourmet Sitges", city: "Sitges", tariffCode: "WEB+PART" },
  { code: "C-0012", name: "Cansaladeria Vall", city: "Ripoll", tariffCode: "CATALUNYA" },
  { code: "C-0011", name: "Carnisseria Puig", city: "Olot", tariffCode: "SARGAIRE" },
  { code: "C-0009", name: "Cash & Carry Levante", city: "Vic", tariffCode: "SARGAIRE" },
  { code: "C-0024", name: "Cash Ponent", city: "Balaguer", tariffCode: "CCAA" },
  { code: "C-0030", name: "Hotel Costa Azul", city: "", tariffCode: "CCAA" },
];

export function getMockClientTariffs(): Promise<ClientTariffApi[]> {
  return mockRequest(clientTariffs);
}

export function addMockClient(client: ClientTariffApi): Promise<ClientTariffApi[]> {
  clientTariffs = [...clientTariffs, client];
  return mockRequest(clientTariffs);
}

export function updateMockClient(code: string, client: ClientTariffApi): Promise<ClientTariffApi[]> {
  clientTariffs = clientTariffs.map((item) => (item.code === code ? client : item));
  return mockRequest(clientTariffs);
}
