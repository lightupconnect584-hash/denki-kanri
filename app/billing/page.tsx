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
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonth);
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
  const [closeDay, setCloseDay] = useState(31); // 締め日（31=月末）

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/app-settings")
      .then((r) => r.json())
      .then((d) => setCloseDay(d.billingCloseDay ?? 31))
      .catch(() => {});
  }, [status]);

  const [savingBillingId, setSavingBillingId] = useState<string | null>(null);

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

  // 請求月の変更（管理者）。空文字で自動（作業月）に戻す
  const handleBillingMonthChange = async (projectId: string, month: string) => {
    setSavingBillingId(projectId);
    // 楽観的に反映
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, billingMonth: month || null } : p)));
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingMonth: month || null }),
      });
    } catch {
      // ignore
    }
    setSavingBillingId(null);
  };

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

  // 締め日を考慮した月キー。締め日を過ぎた作業は翌月の請求期間に繰り越す
  const getWorkMonthKey = (p: Project) => {
    const wd = getWorkDate(p);
    const d = new Date(wd.getFullYear(), wd.getMonth(), 1);
    if (closeDay < 31 && wd.getDate() > closeDay) d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  // 請求月（billingMonth優先、なければ作業月）
  const getMonthKey = (p: Project) => p.billingMonth || getWorkMonthKey(p);

  // YYYY-MM に n か月足す
  const addMonths = (ym: string, n: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const months = useMemo(() => {
    const set = new Set<string>();
    myProjects.forEach((p) => set.add(getMonthKey(p)));
    return Array.from(set).sort().reverse();
  }, [myProjects, closeDay]);

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
  }, [myProjects, selectedMonth, selectedPartner, onlyDone, closeDay]);

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
    return <div className="min-h-full flex items-center justify-center bg-gray-950"><p className="text-gray-400">読み込み中...</p></div>;
  }

  const monthLabel = (m: string) => {
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
    <div className="min-h-full flex flex-col bg-gray-950">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-4 sm:py-6">
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
              <option value="all">全期間</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
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
          <p className="text-[11px] text-gray-500">
            {closeDay >= 31 ? "月末締めで集計中" : `${closeDay}日締めで集計中`}
            {role === "ADMIN" && "（設定で変更できます）"}
          </p>
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
                    const workMonth = getWorkMonthKey(p);
                    const monthOptions = [workMonth, addMonths(workMonth, 1), addMonths(workMonth, 2)];
                    return (
                      <div key={p.id} className="px-3 py-2">
                        <Link href={`/projects/${p.id}`} className="flex items-center gap-2 hover:opacity-80 transition">
                          <p className="text-xs text-gray-400 shrink-0 w-10">{dateStr}</p>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-100 truncate">{p.title}</p>
                            {p.workType && <p className="text-xs text-gray-400 truncate">⚪︎ {p.workType}</p>}
                          </div>
                          <p className="text-xs font-bold text-gray-100 shrink-0">¥{(p.amount || 0).toLocaleString()}</p>
                        </Link>
                        {role === "ADMIN" && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[11px] text-gray-500 shrink-0">請求月</span>
                            <select
                              value={p.billingMonth || ""}
                              disabled={savingBillingId === p.id}
                              onChange={(e) => handleBillingMonthChange(p.id, e.target.value)}
                              className={`text-[11px] rounded border px-1.5 py-0.5 bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${p.billingMonth ? "border-amber-600 text-amber-300" : "border-gray-600 text-gray-300"}`}
                            >
                              <option value="">自動（{monthLabel(workMonth)}）</option>
                              {monthOptions.map((m) => (
                                <option key={m} value={m}>{monthLabel(m)}分</option>
                              ))}
                            </select>
                            {p.billingMonth && p.billingMonth !== workMonth && (
                              <span className="text-[11px] text-amber-400 shrink-0">→ {monthLabel(p.billingMonth)}に計上</span>
                            )}
                          </div>
                        )}
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
