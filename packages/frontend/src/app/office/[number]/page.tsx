"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { useCarriers } from "@/hooks/useCarriers";
import { useCatalog } from "@/hooks/useCatalog";
import { useClientTariffs } from "@/hooks/useClientTariffs";
import { useOrders } from "@/hooks/useOrders";
import { useRates } from "@/hooks/useRates";
import { formatDateDisplay } from "@/lib/orderCalculations";

function formatPrice(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-900">{value}</p>
    </div>
  );
}

export default function OfficeOrderDetailPage() {
  const params = useParams<{ number: string }>();
  const { data: orders, isLoading, error } = useOrders();
  const { data: clients } = useClientTariffs();
  const { tariffColumns, data: rates } = useRates();
  const { data: carriers } = useCarriers();
  const { data: products } = useCatalog();

  const order = orders.find((item) => item.number === params.number);

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link
          href="/office"
          className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Tornar
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">Comanda {params.number}</h1>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Carregant...</p>}
      {error && <p className="text-sm text-red-600">No s&apos;ha pogut carregar la comanda.</p>}
      {!isLoading && !error && !order && (
        <p className="text-sm text-gray-500">No s&apos;ha trobat la comanda {params.number}.</p>
      )}

      {order && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-bold text-gray-900">Capçalera</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Núm. comanda" value={order.number} />
              <Field
                label="Estat"
                value={<Badge variant={order.status === "Incidència" ? "negative" : "info"}>{order.status}</Badge>}
              />
              <Field
                label="Client"
                value={clients.find((item) => item.code === order.clientCode)?.name ?? order.clientCode}
              />
              <Field label="Població de destí" value={order.poblacioDesti || "—"} />
              <Field
                label="Tarifa"
                value={tariffColumns.find((item) => item.code === order.tariffCode)?.name ?? "—"}
              />
              <Field
                label="Transportista"
                value={carriers.find((item) => item.code === order.carrierCode)?.name ?? "—"}
              />
              <Field label="Data comanda" value={formatDateDisplay(order.orderDate)} />
              <Field
                label="Data lliurament"
                value={order.deliveryDate ? formatDateDisplay(order.deliveryDate) : "—"}
              />
              <Field
                label="Data expedició"
                value={order.shippingDate ? formatDateDisplay(order.shippingDate) : "—"}
              />
              <Field label="Núm. bultos" value={order.packageCount} />
            </div>

            <div className="mt-4">
              <Field label="Adreça de lliurament" value={order.deliveryAddress || "—"} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Observacions de producció globals" value={order.productionNotes || "—"} />
              <Field label="Observacions de lliurament" value={order.deliveryNotes || "—"} />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-bold text-gray-900">Línies</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Producte</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Format</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Unitats demanades</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Unitats lliurades</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Pes demanat (kg)</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Pes lliurat (kg)</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Preu unitari</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Subtotal</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Obs. producció</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => {
                    const product = products.find((item) => item.code === line.productCode);
                    const rate = rates.find((item) => item.productCode === line.productCode);
                    const unitPrice = order.tariffCode ? (rate?.prices[order.tariffCode] ?? null) : null;
                    const subtotal = unitPrice !== null ? line.orderedUnits * unitPrice : null;
                    return (
                      <tr key={line.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-2 text-gray-900">
                          {product ? `${product.code} · ${product.description}` : line.productCode}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{product?.format ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{line.orderedUnits}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{line.deliveredUnits}</td>
                        <td className="px-3 py-2 text-right text-gray-900">
                          {line.orderedWeightKg.toFixed(3).replace(".", ",")}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900">
                          {line.deliveredWeightKg.toFixed(3).replace(".", ",")}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900">
                          {unitPrice !== null ? formatPrice(unitPrice) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {subtotal !== null ? formatPrice(subtotal) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={line.productionNotes.trim().length > 0}
                            disabled
                            className="h-4 w-4 rounded border-gray-300 text-ink"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
