// 「要対応」判定ロジック（ダッシュボード表示とバッジ件数で共用）

export interface ActionCheckProject {
  status: string;
  visitDate: string | Date | null;
  contactRequired?: boolean;
  contactedAt?: string | Date | null;
  updatedAt: string | Date;
  assignedTo?: { id: string } | null;
  assignedToId?: string | null;
  quotes: { status: string }[];
  onHold?: boolean;
  holdAt?: string | Date | null;
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

// 訪問予定日が過ぎているか（当日は含まない）
function visitOverdue(visitDate: string | Date | null): boolean {
  if (!visitDate) return false;
  const v = new Date(visitDate);
  v.setHours(23, 59, 59, 999);
  return v.getTime() < Date.now();
}

// 管理者にとっての要対応理由（なければnull）
export function adminActionReason(p: ActionCheckProject): ActionReason | null {
  // ── 保留中の案件 ──
  // 保留7日未満は要対応に出さない（保留の意味を保つ）。7日以上は忘れ防止で浮上させる
  if (p.onHold) {
    if (p.holdAt && daysSince(p.holdAt) >= 7) {
      return { label: `保留のまま${daysSince(p.holdAt)}日`, color: "bg-orange-100 text-orange-700" };
    }
    return null;
  }

  // 入居者立ち会い・要連絡（連絡が取れるまで表示）
  if (p.contactRequired && !p.contactedAt && !DONE.includes(p.status)) {
    return { label: "アポイントを取る", color: "bg-red-100 text-red-700" };
  }

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
  if (p.status === "ACCEPTED" && visitOverdue(p.visitDate)) {
    return { label: "訪問日超過・報告待ち", color: "bg-red-100 text-red-700" };
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
  // ── 保留中の案件 ──
  // 保留7日未満は要対応に出さない（保留の意味を保つ）。7日以上は忘れ防止で浮上させる
  if (p.onHold) {
    if (p.holdAt && daysSince(p.holdAt) >= 7) {
      return { label: `保留のまま${daysSince(p.holdAt)}日`, color: "bg-orange-100 text-orange-700" };
    }
    return null;
  }

  // 入居者立ち会い・要連絡（連絡が取れるまで表示）
  if (p.contactRequired && !p.contactedAt && !DONE.includes(p.status)) {
    return { label: "アポイントを取る", color: "bg-red-100 text-red-700" };
  }

  // 通常の流れ（受注→訪問日→報告）は一覧のステータスで分かるので、
  // 要対応には「滞っているもの」だけを出す
  if (p.status === "PENDING" && daysSince(p.updatedAt) >= 2) {
    return { label: `未受注${daysSince(p.updatedAt)}日`, color: "bg-yellow-100 text-yellow-700" };
  }
  if (p.status === "REWORK") {
    return { label: "再報告が必要", color: "bg-red-100 text-red-700" };
  }
  if (p.status === "QUOTE_REQUESTED" && !p.quotes.some((q) => q.status === "PENDING") && daysSince(p.updatedAt) >= 2) {
    return { label: "見積りの提出", color: "bg-orange-100 text-orange-700" };
  }
  // ── 放置検知 ──
  if (p.status === "ACCEPTED" && visitOverdue(p.visitDate)) {
    return { label: "完了報告の提出", color: "bg-purple-100 text-purple-700" };
  }
  return null;
}

export function actionReason(role: string | undefined, p: ActionCheckProject): ActionReason | null {
  if (role === "ADMIN") return adminActionReason(p);
  if (role === "PARTNER") return partnerActionReason(p);
  return null;
}
