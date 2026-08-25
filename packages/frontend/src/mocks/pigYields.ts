import type { RendimentPorcApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

function pesTotal(unitatsPerPorc: string, kgPerUnitat: string): string {
  return (Number(unitatsPerPorc) * Number(kgPerUnitat)).toFixed(3);
}

let pigYields: RendimentPorcApi[] = [
  {
    id: 1,
    agrupacioRendiment: "MAGRE",
    categoria: "PECES MAGRES",
    agrupacioProduccio: "ESPATLLES AMB OS",
    unitatsPerPorc: "2.00",
    kgPerUnitat: "3.500",
    pesTotal: pesTotal("2.00", "3.500"),
  },
  {
    id: 2,
    agrupacioRendiment: "KG",
    categoria: "PECES NOBLES KG",
    agrupacioProduccio: "COSTELLA",
    unitatsPerPorc: "2.00",
    kgPerUnitat: "12.000",
    pesTotal: pesTotal("2.00", "12.000"),
  },
  {
    id: 3,
    agrupacioRendiment: "KG",
    categoria: "PECES NOBLES KG",
    agrupacioProduccio: "GALTES",
    unitatsPerPorc: "2.00",
    kgPerUnitat: "0.350",
    pesTotal: pesTotal("2.00", "0.350"),
  },
  {
    id: 4,
    agrupacioRendiment: "KG",
    categoria: "PECES NOBLES KG",
    agrupacioProduccio: "LLOM SENCER",
    unitatsPerPorc: "2.00",
    kgPerUnitat: "2.500",
    pesTotal: pesTotal("2.00", "2.500"),
  },
  {
    id: 5,
    agrupacioRendiment: "KG",
    categoria: "PECES NOBLES KG",
    agrupacioProduccio: "ORELLA",
    unitatsPerPorc: "2.00",
    kgPerUnitat: "0.350",
    pesTotal: pesTotal("2.00", "0.350"),
  },
  {
    id: 6,
    agrupacioRendiment: "KG",
    categoria: "PECES NOBLES KG",
    agrupacioProduccio: "SECRETS",
    unitatsPerPorc: "2.00",
    kgPerUnitat: "0.400",
    pesTotal: pesTotal("2.00", "0.400"),
  },
  {
    id: 7,
    agrupacioRendiment: "PAQ",
    categoria: "PECES NOBLES PAQ",
    agrupacioProduccio: "PEUS",
    unitatsPerPorc: "4.00",
    kgPerUnitat: "0.000",
    pesTotal: pesTotal("4.00", "0.000"),
  },
];

let nextPigYieldId = pigYields.length + 1;

export function getMockPigYields(): Promise<RendimentPorcApi[]> {
  return mockRequest(pigYields);
}

export function addMockPigYield(pigYield: Omit<RendimentPorcApi, "id">): Promise<RendimentPorcApi[]> {
  pigYields = [...pigYields, { id: nextPigYieldId++, ...pigYield }];
  return mockRequest(pigYields);
}

export function updateMockPigYield(id: number, pigYield: RendimentPorcApi): Promise<RendimentPorcApi[]> {
  pigYields = pigYields.map((item) => (item.id === id ? pigYield : item));
  return mockRequest(pigYields);
}

export function deleteMockPigYield(id: number): Promise<RendimentPorcApi[]> {
  pigYields = pigYields.filter((item) => item.id !== id);
  return mockRequest(pigYields);
}
