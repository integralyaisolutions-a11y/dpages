import type { TransportistaApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

const carriers: TransportistaApi[] = [
  { id: 1, codi: "TR-DHL", nom: "DHL", actiu: true },
  { id: 2, codi: "TR-NACEX", nom: "Nacex", actiu: true },
];

export function getMockCarriers(): Promise<TransportistaApi[]> {
  return mockRequest(carriers);
}
