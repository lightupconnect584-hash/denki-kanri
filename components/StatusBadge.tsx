const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "依頼中", color: "bg-yellow-100 text-yellow-800" },
  ACCEPTED: { label: "受注済", color: "bg-blue-100 text-blue-800" },
  INSPECTED: { label: "完了報告済", color: "bg-indigo-100 text-indigo-800" },
  CONFIRMED: { label: "確認済", color: "bg-green-100 text-green-800" },
  QUOTE_REQUESTED: { label: "見積依頼中", color: "bg-orange-100 text-orange-800" },
  QUOTE_REVIEWING: { label: "見積り中", color: "bg-purple-100 text-purple-800" },
  COMPLETED: { label: "完了", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "差し戻し", color: "bg-red-100 text-red-700" },
  INSPECTING: { label: "対応中", color: "bg-blue-100 text-blue-800" },
  REWORK: { label: "再報告待ち", color: "bg-amber-100 text-amber-800" },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}
