export function StatCard({
  label,
  value,
  secondary,
  alert = false,
}: {
  label: string;
  value: string | number;
  secondary?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? "text-red-600" : "text-gray-900"}`}>{value}</p>
      {secondary && <p className="mt-1 text-2xl font-bold text-gray-500">{secondary}</p>}
    </div>
  );
}
