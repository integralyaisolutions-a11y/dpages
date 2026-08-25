import { mockRequest } from "@/lib/mockClient";

export type PigConfig = {
  pernilKgPerPig: number;
  retallsKgPerPig: number;
  espatllesKgPerPig: number;
};

const pigConfig: PigConfig = {
  pernilKgPerPig: 12,
  retallsKgPerPig: 6,
  espatllesKgPerPig: 7,
};

export function getMockPigConfig(): Promise<PigConfig> {
  return mockRequest(pigConfig);
}
