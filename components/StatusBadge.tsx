const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "依頼中", color: "bg-yellow-100 text-yellow-800" },
  INSPECTING: { label: "点検中", color: "bg-blue-100 text-blue-800" },
  INSPECTED: { label: "点検完了", color: "bg-green-100 text-green-800" },
  QUOTE_REQUESTED: { label: "見積依頼中", color: "bg-orange-100 text-orange-800" },
  QUOTE_RECEIVED: { label: "見積受領", color: "bg-purple-100 text-purple-800" },
  COMPLETED: { label: "完了", color: "bg-gray-100 text-gray-700" },
  REJECTED: { label: "却下", color: "bg-red-100 text-red-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}
