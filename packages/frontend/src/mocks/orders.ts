import type { OrderApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

let orders: OrderApi[] = [
  {
    number: "000073",
    status: "Oberta",
    clientCode: "C-0011",
    poblacioDesti: "Barcelona",
    tariffCode: "CCAA",
    carrierCode: "TR-DHL",
    orderDate: "2026-08-10",
    deliveryDate: "2026-08-17",
    shippingDate: "2026-08-16",
    packageCount: 1,
    deliveryAddress: "Calle Mayor 12, Madrid",
    productionNotes: "",
    deliveryNotes: "",
    lines: [
      {
        id: "000073-1",
        productCode: "CTLLTATN",
        productionDate: "2026-08-14",
        orderedUnits: 35,
        deliveredUnits: 30,
        orderedWeightKg: 17.5,
        deliveredWeightKg: 16,
        productionNotes: "",
      },
      {
        id: "000073-2",
        productCode: "HAMTN2",
        productionDate: "2026-08-14",
        orderedUnits: 35,
        deliveredUnits: 0,
        orderedWeightKg: 8.75,
        deliveredWeightKg: 0,
        productionNotes: "cortar fino",
      },
    ],
  },
  {
    number: "000074",
    status: "Incidència",
    clientCode: "C-0030",
    poblacioDesti: "Sabadell",
    tariffCode: "CCAA",
    carrierCode: "TR-NACEX",
    orderDate: "2026-08-18",
    deliveryDate: "2026-08-25",
    // shippingDate y adreça: no confirmados en la data que me pasaste.
    shippingDate: null,
    packageCount: 1,
    deliveryAddress: "",
    productionNotes: "",
    deliveryNotes: "",
    lines: [
      // Líneas no confirmadas en detalle: producto/unitats de relleno,
      // solo las dates de producció (20/08 y 21/08) vienen de tu spec.
      {
        id: "000074-1",
        productCode: "BOTNGTE",
        productionDate: "2026-08-20",
        orderedUnits: 10,
        deliveredUnits: 0,
        orderedWeightKg: 12,
        deliveredWeightKg: 0,
        productionNotes: "",
      },
      {
        id: "000074-2",
        productCode: "HAMTN2",
        productionDate: "2026-08-21",
        orderedUnits: 5,
        deliveredUnits: 0,
        orderedWeightKg: 1.25,
        deliveredWeightKg: 0,
        productionNotes: "",
      },
    ],
  },
];

export function getMockOrders(): Promise<OrderApi[]> {
  return mockRequest(orders);
}

export function addMockOrder(order: OrderApi): Promise<OrderApi[]> {
  orders = [...orders, order];
  return mockRequest(orders);
}

export function updateMockOrder(number: string, order: OrderApi): Promise<OrderApi[]> {
  orders = orders.map((item) => (item.number === number ? order : item));
  return mockRequest(orders);
}

export function nextMockOrderNumber(): string {
  const max = orders.reduce((highest, order) => Math.max(highest, Number(order.number)), 0);
  return String(max + 1).padStart(6, "0");
}
