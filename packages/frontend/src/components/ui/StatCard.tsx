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
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white px-5 py-4">
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-bold break-words ${alert ? "text-red-600" : "text-gray-900"}`}>{value}</p>
      {secondary && (
        <p title={secondary} className="mt-1 text-2xl font-bold break-words text-gray-500">
          {secondary}
        </p>
      )}
    </div>
  );
}
