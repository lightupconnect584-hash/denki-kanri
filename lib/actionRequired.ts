// 「要対応」判定ロジック（ダッシュボード表示とバッジ件数で共用）

export interface ActionCheckProject {
  status: string;
  updatedAt: string | Date;
  assignedTo?: { id: string } | null;
  assignedToId?: string | null;
  quotes: { status: string }[];
}

export interface ActionReason {
  label: string;
  color: string; // Tailwindクラス
}

const DONE = ["CONFIRMED", "COMPLETED", "REJECTED"];

// 最終更新からの経過日数
function daysSince(date: string | Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

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
  // ── 放置検知 ──
  if (p.status === "PENDING" && assigned && daysSince(p.updatedAt) >= 3) {
    return { label: `未受注${daysSince(p.updatedAt)}日`, color: "bg-yellow-100 text-yellow-700" };
  }
  // 受注後、動きがないまま日数が経過 → 報告待ち
  if (p.status === "ACCEPTED" && daysSince(p.updatedAt) >= 7) {
    return { label: `報告待ち${daysSince(p.updatedAt)}日`, color: "bg-red-100 text-red-700" };
  }
  if (
    p.status === "QUOTE_REQUESTED" &&
    !p.quotes.some((q) => q.status === "PENDING") &&
    daysSince(p.updatedAt) >= 7
  ) {
    return { label: `見積り待ち${daysSince(p.updatedAt)}日`, color: "bg-yellow-100 text-yellow-700" };
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
  // 受注から日数が経過 → 完了報告を促す
  if (p.status === "ACCEPTED" && daysSince(p.updatedAt) >= 7) {
    return { label: "完了報告の提出", color: "bg-purple-100 text-purple-700" };
  }
  return null;
}

export function actionReason(role: string | undefined, p: ActionCheckProject): ActionReason | null {
  if (role === "ADMIN") return adminActionReason(p);
  if (role === "PARTNER") return partnerActionReason(p);
  return null;
}
