import type { CarrierApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

const carriers: CarrierApi[] = [
  { code: "TR-DHL", name: "DHL" },
  { code: "TR-NACEX", name: "Nacex" },
];

export function getMockCarriers(): Promise<CarrierApi[]> {
  return mockRequest(carriers);
}
