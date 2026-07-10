"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

interface Project {
  id: string;
  title: string;
  location: string;
  workType: string | null;
  status: string;
  amount: number | null;
  createdAt: string;
  dueDate: string | null;
  billingMonth: string | null;
  inspections: { workDate: string }[];
  assignedTo: { id: string; name: string; companyName: string | null } | null;
}

interface MonthlyInvoice {
  id: string;
  yearMonth: string;
  filename: string;
  originalName: string;
  createdAt: string;
  partner: { id: string; name: string; companyName: string | null } | null;
}

const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState<string>("__unclosed__"); // 初期は未締め
  const [selectedPartner, setSelectedPartner] = useState<string>("all");
  const onlyDone = true;

  const role = (session?.user as { role?: string })?.role;
  const userId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const [monthlyInvoices, setMonthlyInvoices] = useState<MonthlyInvoice[]>([]);
  const [uploadingMonthly, setUploadingMonthly] = useState(false);
  const [deletingMonthlyId, setDeletingMonthlyId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [heldIds, setHeldIds] = useState<Set<string>>(new Set()); // 今回は締めずに次回に回す案件
  const [closeTargetMonth, setCloseTargetMonth] = useState<string>(thisMonth);
  const [dismissedCycle, setDismissedCycle] = useState<string | null>(null);

  useEffect(() => {
    try { setDismissedCycle(localStorage.getItem("billing-close-dismissed")); } catch {}
  }, []);

  const markCycleDismissed = (cycle: string | null) => {
    if (!cycle) return;
    try { localStorage.setItem("billing-close-dismissed", cycle); } catch {}
    setDismissedCycle(cycle);
  };

  // 締め時期の判定：月末3日間 → 今月分、翌月5日まで → 先月分（締め遅れ対応）。それ以外は締め案内を出さない
  const closingCycle: string | null = (() => {
    const d = now.getDate();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (d >= lastDay - 2) return thisMonth;
    if (d <= 5) {
      const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, "0")}`;
    }
    return null;
  })();
  // 締め時期かつ、その回をまだ締めていない場合だけ締めバーを出す
  const showClosePrompt = closingCycle !== null && dismissedCycle !== closingCycle;

  // 締め時期は、締める月の初期値をその対象月に合わせる
  useEffect(() => {
    if (closingCycle) setCloseTargetMonth(closingCycle);
  }, [closingCycle]);

  // 未締め案件を指定月で締める（projectIds を渡すとその案件のみ）
  const UNCLOSED = "__unclosed__";
  const closeMonth = async (month: string, projectIds: string[]) => {
    if (projectIds.length === 0) return;
    if (!confirm(`選択した ${projectIds.length}件 を「${monthLabel(month)}分」として締めますか？`)) return;
    setClosing(true);
    await fetch("/api/billing/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, projectIds }),
    });
    await fetchProjects();
    setClosing(false);
    markCycleDismissed(closingCycle);
    setSelectedMonth(month);
  };

  // 未締めを作業月ごとに一括で締める（過去データの再設定用）
  const closeByWorkMonth = async () => {
    if (!confirm("未締めの案件を、それぞれの作業月で一括で締めますか？\n（過去分をまとめて振り分け直せます）")) return;
    setClosing(true);
    await fetch("/api/billing/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ byWorkMonth: true }),
    });
    await fetchProjects();
    setClosing(false);
    markCycleDismissed(closingCycle);
    setSelectedMonth("all");
  };

  const reopenMonth = async (month: string) => {
    if (!confirm(`「${monthLabel(month)}分」の締めを解除して未締めに戻しますか？`)) return;
    setClosing(true);
    await fetch("/api/billing/close", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    await fetchProjects();
    setClosing(false);
    setSelectedMonth(UNCLOSED);
  };

  const fetchProjects = () => {
    return fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => {
        setProjects(data.filter((p) => DONE_STATUSES.includes(p.status)));
        setLoading(false);
      });
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchProjects();
  }, [status]);

  const fetchMonthlyInvoices = () => {
    return fetch("/api/monthly-invoices")
      .then((r) => r.json())
      .then((data: MonthlyInvoice[]) => setMonthlyInvoices(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchMonthlyInvoices();
  }, [status]);

  // 月締め請求書のアップロード（協力会社）
  const handleMonthlyUpload = async (month: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingMonthly(true);
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("month", month);
        await fetch("/api/monthly-invoices", { method: "POST", body: formData });
      } catch {
        // ignore
      }
    }
    await fetchMonthlyInvoices();
    setUploadingMonthly(false);
    e.target.value = "";
  };

  const handleDeleteMonthly = async (invoiceId: string) => {
    if (!confirm("この請求書を削除しますか？")) return;
    setDeletingMonthlyId(invoiceId);
    await fetch("/api/monthly-invoices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    await fetchMonthlyInvoices();
    setDeletingMonthlyId(null);
  };

  const myProjects = useMemo(() => {
    if (role === "PARTNER") return projects.filter((p) => p.assignedTo?.id === userId);
    return projects;
  }, [projects, role, userId]);

  // 作業日を取得（inspectionsのworkDate最新値、なければdueDate→createdAt）
  const getWorkDate = (p: Project): Date => {
    if (p.inspections.length > 0) {
      const latest = p.inspections.reduce((a, b) =>
        new Date(a.workDate) > new Date(b.workDate) ? a : b
      );
      return new Date(latest.workDate);
    }
    return new Date(p.dueDate || p.createdAt);
  };

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const workMonthKey = (p: Project) => {
    const d = getWorkDate(p);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  // 締め済みならその月、未締めなら UNCLOSED
  const getMonthKey = (p: Project) => p.billingMonth || UNCLOSED;

  // YYYY-MM に n か月足す
  const addMonths = (ym: string, n: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  // 締め済みの月一覧（未締めは除く）
  const months = useMemo(() => {
    const set = new Set<string>();
    myProjects.forEach((p) => { if (p.billingMonth) set.add(p.billingMonth); });
    return Array.from(set).sort().reverse();
  }, [myProjects]);

  // 未締めの件数（フィルターのラベル用）
  const unclosedCount = useMemo(
    () => myProjects.filter((p) => !p.billingMonth).length,
    [myProjects]
  );

  // 締める月の候補：先月〜来月＋未締め案件の作業月（過去分の再設定用）を新しい順に
  const closeTargetOptions = useMemo(() => {
    const set = new Set<string>([addMonths(thisMonth, -1), thisMonth, addMonths(thisMonth, 1)]);
    myProjects.forEach((p) => { if (!p.billingMonth) set.add(workMonthKey(p)); });
    return Array.from(set).sort().reverse();
  }, [myProjects, thisMonth]);

  const partners = useMemo(() => {
    if (role !== "ADMIN") return [];
    const map = new Map<string, string>();
    myProjects.forEach((p) => {
      if (p.assignedTo?.id) map.set(p.assignedTo.id, p.assignedTo.companyName || p.assignedTo.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [myProjects, role]);

  const filtered = useMemo(() => {
    return myProjects.filter((p) => {
      if (onlyDone && !DONE_STATUSES.includes(p.status)) return false;
      // 過去1年以内のみ表示
      if (getWorkDate(p) < oneYearAgo) return false;
      if (selectedMonth !== "all" && getMonthKey(p) !== selectedMonth) return false;
      if (selectedPartner !== "all" && p.assignedTo?.id !== selectedPartner) return false;
      return true;
    });
  }, [myProjects, selectedMonth, selectedPartner, onlyDone]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; projects: Project[]; total: number }>();
    filtered.forEach((p) => {
      const key = p.assignedTo?.id || "unassigned";
      const name = p.assignedTo?.companyName || p.assignedTo?.name || "未担当";
      if (!map.has(key)) map.set(key, { name, projects: [], total: 0 });
      const entry = map.get(key)!;
      entry.projects.push(p);
      entry.total += p.amount || 0;
    });
    // 各グループ内を完了日昇順で並べ替え
    map.forEach((entry) => {
      entry.projects.sort((a, b) => getWorkDate(a).getTime() - getWorkDate(b).getTime());
    });
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filtered]);

  const grandTotal = grouped.reduce((sum, [, g]) => sum + g.total, 0);

  const abbrevAddr = (addr: string) => addr.replace(/[0-9].*$/, "").trim();

  const exportCSV = () => {
    const rows: string[][] = [["協力会社", "物件名", "住所", "作業日", "ステータス", "金額（税別）"]];
    filtered.forEach((p) => {
      const partner = p.assignedTo?.companyName || p.assignedTo?.name || "未担当";
      const dateStr = getWorkDate(p).toLocaleDateString("ja-JP");
      rows.push([partner, p.title, p.location, dateStr, p.status, String(p.amount || 0)]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `費用集計_${selectedMonth === "all" ? "全期間" : monthLabel(selectedMonth)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (status === "loading" || loading) {
    return <div className="min-h-full flex items-center justify-center bg-gray-900"><p className="text-gray-400">読み込み中...</p></div>;
  }

  const monthLabel = (m: string) => {
    if (m === UNCLOSED) return "未締め";
    if (m === "all") return "全期間";
    const [y, mo] = m.split("-");
    return `${y}年${parseInt(mo)}月`;
  };

  // 月締め請求書ブロック（指定の協力会社分）
  const renderMonthlyInvoice = (partnerId: string) => {
    const list = monthlyInvoices
      .filter((mi) => mi.partner?.id === partnerId)
      .filter((mi) => selectedMonth === "all" || mi.yearMonth === selectedMonth)
      .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    const canUpload = role === "PARTNER" && selectedMonth !== "all";

    return (
      <div className="bg-gray-800/60 border border-amber-700/50 rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🧾</span>
            <span className="text-sm font-bold text-amber-300">
              月締め請求書{selectedMonth !== "all" ? `（${monthLabel(selectedMonth)}分）` : ""}
            </span>
          </div>
          {canUpload && (
            <label className={`inline-flex items-center gap-1 text-xs rounded-lg px-3 py-1.5 border cursor-pointer transition ${uploadingMonthly ? "bg-gray-700 text-gray-400 border-gray-600" : "bg-blue-900/40 text-blue-300 border-blue-700 hover:bg-blue-900/70"}`}>
              <span>{uploadingMonthly ? "送信中..." : "＋ 請求書を添付"}</span>
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                disabled={uploadingMonthly}
                onChange={(e) => handleMonthlyUpload(selectedMonth, e)}
              />
            </label>
          )}
        </div>
        {list.length > 0 ? (
          <div className="space-y-1.5">
            {list.map((mi) => {
              const url = mi.filename.startsWith("http") ? mi.filename : `/uploads/${mi.filename}`;
              const isImage = !mi.originalName.toLowerCase().endsWith(".pdf");
              return (
                <div key={mi.id} className="flex items-center justify-between bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2">
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-300 hover:underline flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{isImage ? "🖼" : "📄"}</span>
                    <span className="truncate">
                      {selectedMonth === "all" && <span className="text-amber-400 mr-1">[{monthLabel(mi.yearMonth)}]</span>}
                      {mi.originalName}
                    </span>
                  </a>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <a href={url} download={mi.originalName}
                      className="text-xs text-green-400 border border-green-700 rounded px-2 py-0.5 hover:bg-green-900/40 transition">↓ DL</a>
                    {(role === "ADMIN" || mi.partner?.id === userId) && (
                      <button onClick={() => handleDeleteMonthly(mi.id)} disabled={deletingMonthlyId === mi.id}
                        className="text-xs text-red-400 border border-red-700 rounded px-2 py-0.5 hover:bg-red-900/40 transition disabled:opacity-50">削除</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-500 py-1">
            {role === "PARTNER"
              ? (selectedMonth === "all" ? "月を選択して請求書を添付してください" : "この月の請求書はまだ添付されていません")
              : "請求書はまだ届いていません"}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
      <Header />
      <main className="flex-1 max-w-3xl lg:max-w-5xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white flex-1">
            {role === "PARTNER" ? "完了済依頼・請求金額" : "完了済依頼・費用集計"}
          </h2>
          {filtered.length > 0 && (
            <button onClick={exportCSV}
              className="text-xs bg-gray-800 text-gray-200 border border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-700 transition">
              CSV出力
            </button>
          )}
        </div>

        {/* フィルター */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-3 mb-4 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="flex-1 min-w-0 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={UNCLOSED}>未締め{unclosedCount > 0 ? `（${unclosedCount}件）` : ""}</option>
              <option value="all">全期間（締め済み）</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}分</option>
              ))}
            </select>
            {role === "ADMIN" && (
              <select
                value={selectedPartner}
                onChange={(e) => setSelectedPartner(e.target.value)}
                className="flex-1 min-w-0 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">全協力会社</option>
                {partners.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 合計金額バナー */}
        <div className="bg-blue-600 text-white rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs opacity-80 mb-0.5">
              {selectedMonth === "all" ? "累計合計" : `${monthLabel(selectedMonth)} 合計`}
            </p>
            <p className="text-2xl font-bold">¥{grandTotal.toLocaleString()}</p>
          </div>
          <p className="text-sm opacity-80">{filtered.length}件</p>
        </div>

        {/* 締め時期外：案内だけ表示（締めボタンは月末まで出さない） */}
        {role === "ADMIN" && selectedMonth === UNCLOSED && filtered.length > 0 && !showClosePrompt && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 mb-4">
            <p className="text-xs text-gray-400">
              🗓 締めボタンは月末（〜翌月初め）の締め時期に表示されます。未締めの案件はここに溜まっていきます。
            </p>
          </div>
        )}

        {/* 締めバー（管理者・未締め表示時・締め時期のみ） */}
        {role === "ADMIN" && selectedMonth === UNCLOSED && filtered.length > 0 && showClosePrompt && (() => {
          const toClose = filtered.filter((p) => !heldIds.has(p.id));
          return (
            <div className="bg-amber-950/40 border border-amber-700 rounded-xl p-3 mb-4">
              <p className="text-xs text-amber-200 mb-2">
                締める月を選んで確定します。チェックを外した案件は今回締めず、次回に回ります。
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={closeTargetMonth}
                  onChange={(e) => setCloseTargetMonth(e.target.value)}
                  className="border border-amber-700 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {closeTargetOptions.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}分
                      {m === addMonths(thisMonth, -1) ? "（先月）" : m === thisMonth ? "（今月）" : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => closeMonth(closeTargetMonth, toClose.map((p) => p.id))}
                  disabled={closing || toClose.length === 0}
                  className="flex-1 min-w-0 bg-amber-600 text-white text-sm rounded-lg py-2 font-bold hover:bg-amber-700 disabled:opacity-50 transition"
                >
                  {closing ? "処理中..." : `選択した ${toClose.length}件 を締める`}
                </button>
              </div>
            </div>
          );
        })()}

        {/* 過去分の再設定：作業月ごとに一括で振り分け（締め時期に関係なく常時） */}
        {role === "ADMIN" && selectedMonth === UNCLOSED && filtered.length > 0 && (
          <button
            onClick={closeByWorkMonth}
            disabled={closing}
            className="w-full mb-4 text-xs text-gray-400 border border-gray-700 rounded-lg py-2 hover:bg-gray-800 hover:text-amber-300 disabled:opacity-50 transition"
          >
            ↧ 未締めを「作業月ごと」に一括で締める（過去分の再設定用）
          </button>
        )}

        {/* 締め済み月の解除（管理者） */}
        {role === "ADMIN" && selectedMonth !== UNCLOSED && selectedMonth !== "all" && filtered.length > 0 && (
          <div className="flex justify-end mb-3">
            <button
              onClick={() => reopenMonth(selectedMonth)}
              disabled={closing}
              className="text-xs text-gray-400 border border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-800 hover:text-amber-300 disabled:opacity-50 transition"
            >
              ↩ {monthLabel(selectedMonth)}分の締めを解除
            </button>
          </div>
        )}

        {/* 月締め請求書（協力会社：自分の分） */}
        {role === "PARTNER" && userId && renderMonthlyInvoice(userId)}

        {grouped.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">💰</p>
            <p>該当する金額データがありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([key, group]) => (
              <div key={group.name} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {role === "ADMIN" && (
                  <>
                    <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between">
                      <p className="font-medium text-gray-100 text-sm">{group.name}</p>
                      <p className="text-sm font-bold text-blue-700">合計 ¥{group.total.toLocaleString()}</p>
                    </div>
                    {key !== "unassigned" && (
                      <div className="px-4 pt-3">{renderMonthlyInvoice(key)}</div>
                    )}
                  </>
                )}
                <div className="divide-y divide-gray-700">
                  {group.projects.map((p) => {
                    const dateStr = getWorkDate(p).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
                    const isUnclosedView = selectedMonth === UNCLOSED;
                    const willClose = role === "ADMIN" && isUnclosedView && !heldIds.has(p.id);
                    return (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-2">
                        {/* 未締め表示（管理者）：締める対象のチェック */}
                        {role === "ADMIN" && isUnclosedView && (
                          <input
                            type="checkbox"
                            checked={!heldIds.has(p.id)}
                            onChange={() =>
                              setHeldIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              })
                            }
                            className="w-4 h-4 shrink-0 accent-amber-500"
                            title={willClose ? "締める対象" : "今回は締めない"}
                          />
                        )}
                        <Link href={`/projects/${p.id}`} className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition">
                          <p className="text-xs text-gray-400 shrink-0 w-10">{dateStr}</p>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-100 truncate">{p.title}</p>
                            {p.workType && <p className="text-xs text-gray-400 truncate">⚪︎ {p.workType}</p>}
                          </div>
                          <p className="text-xs font-bold text-gray-100 shrink-0">¥{(p.amount || 0).toLocaleString()}</p>
                        </Link>
                      </div>
                    );
                  })}
                </div>
                {role === "PARTNER" && (
                  <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex justify-between">
                    <p className="text-sm text-blue-700">
                      {selectedMonth === "all" ? "累計合計" : `${monthLabel(selectedMonth)} 合計`}
                    </p>
                    <p className="text-sm font-bold text-blue-700">¥{group.total.toLocaleString()}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
