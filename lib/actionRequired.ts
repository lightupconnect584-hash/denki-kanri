// 「要対応」判定ロジック（ダッシュボード表示とバッジ件数で共用）

export interface ActionCheckProject {
  status: string;
  visitDate: string | Date | null;
  assignedTo?: { id: string } | null;
  assignedToId?: string | null;
  quotes: { status: string }[];
}

export interface ActionReason {
  label: string;
  color: string; // Tailwindクラス
}

const DONE = ["CONFIRMED", "COMPLETED", "REJECTED"];

// 管理者にとっての要対応理由（なければnull）
export function adminActionReason(p: ActionCheckProject): ActionReason | null {
  if (p.status === "INSPECTED") {
    return { label: "完了報告の確認", color: "bg-purple-100 text-purple-700" };
  }
  if (
    ["QUOTE_REQUESTED", "QUOTE_REVIEWING"].includes(p.status) &&
    p.quotes.some((q) => q.status === "PENDING")
  ) {
    return { label: "見積りの確認", color: "bg-orange-100 text-orange-700" };
  }
  const assigned = p.assignedTo?.id ?? p.assignedToId;
  if (!assigned && !DONE.includes(p.status)) {
    return { label: "担当未割り当て", color: "bg-red-100 text-red-700" };
  }
  return null;
}

// 協力会社にとっての要対応理由（なければnull）
export function partnerActionReason(p: ActionCheckProject): ActionReason | null {
  if (p.status === "PENDING") {
    return { label: "受注の判断", color: "bg-yellow-100 text-yellow-700" };
  }
  if (p.status === "REWORK") {
    return { label: "再報告が必要", color: "bg-red-100 text-red-700" };
  }
  if (p.status === "QUOTE_REQUESTED" && !p.quotes.some((q) => q.status === "PENDING")) {
    return { label: "見積りの提出", color: "bg-orange-100 text-orange-700" };
  }
  if (p.status === "ACCEPTED" && !p.visitDate) {
    return { label: "訪問日の入力", color: "bg-blue-100 text-blue-700" };
  }
  return null;
}

export function actionReason(role: string | undefined, p: ActionCheckProject): ActionReason | null {
  if (role === "ADMIN") return adminActionReason(p);
  if (role === "PARTNER") return partnerActionReason(p);
  return null;
}
