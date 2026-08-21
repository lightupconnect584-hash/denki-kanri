"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface SalesEntry {
  id: string;
  yearMonth: string;
  category: string;
  label: string;
  sales: number;
  material: number;
  outsource: number;
  invoiced: boolean;
  clientId: string | null;
  projectId: string | null;
  docUrl: string | null;
  docName: string | null;
  salesBreakdown: { date: string; label?: string; amount: number }[] | null;
  workType: string | null;
  workDates: string[];
}

interface ExpenseItem {
  id: string;
  label: string;
  amount: number;
}

interface SalesClient {
  id: string;
  name: string;
  color: string | null;
  feePercent: number;
}

const fmt = (n: number) => n.toLocaleString();

// 数字入力の正規化（全角→半角、数字以外を除去）
const numClean = (v: string) =>
  v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");

export default function SalesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string })?.role;

  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [salesClients, setSalesClients] = useState<SalesClient[]>([]);
  // 📈 推移グラフ
  const [showTrend, setShowTrend] = useState(false);
  const [trend, setTrend] = useState<{ month: string; revenue: number; cost: number; profit: number; profitRate: number | null }[] | null>(null);
  const toggleTrend = async () => {
    const next = !showTrend;
    setShowTrend(next);
    if (next && trend === null) {
      try {
        const r = await fetch("/api/sales/trend");
        if (r.ok) setTrend((await r.json()).trend || []);
      } catch { setTrend([]); }
    }
  };
  const [loading, setLoading] = useState(true);
  const [showExpenses, setShowExpenses] = useState(false);
  const [openBreakdownId, setOpenBreakdownId] = useState<string | null>(null);
  const [newExpLabel, setNewExpLabel] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  // 📄 依頼書原本の拡大ビューア
  // 同一オリジンのプロキシから取得し、実際のContent-Typeで画像/PDFを判定して表示（黒画面対策）
  const [viewerDoc, setViewerDoc] = useState<{ url: string; label: string; objUrl: string | null; isImage: boolean; error: boolean } | null>(null);
  const openViewer = async (url: string, label: string, _docName: string | null) => {
    void _docName;
    setViewerDoc({ url, label, objUrl: null, isImage: false, error: false });
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const b = await r.blob();
      const isImage = b.type.startsWith("image/");
      setViewerDoc({ url, label, objUrl: URL.createObjectURL(b), isImage, error: false });
    } catch {
      setViewerDoc({ url, label, objUrl: null, isImage: false, error: true });
    }
  };
  const closeViewer = () => {
    if (viewerDoc?.objUrl) URL.revokeObjectURL(viewerDoc.objUrl);
    setViewerDoc(null);
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login?callbackUrl=" + encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"));
    if (status === "authenticated" && role && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  const fetchData = useCallback(async (m: string) => {
    setLoading(true);
    const res = await fetch(`/api/sales?month=${m}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries || []);
      setExpenses(data.expenses || []);
      setSalesClients(data.clients || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && role === "ADMIN") fetchData(month);
  }, [status, role, month, fetchData]);

  const shiftMonth = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = (() => {
    const [y, m] = month.split("-");
    return `${y}年${parseInt(m)}月`;
  })();

  // ── 明細操作 ──
  const patchEntry = async (id: string, fields: Partial<SalesEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    await fetch("/api/sales", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    }).catch(() => {});
  };

  const addEntry = async (clientId: string | null) => {
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth: month, clientId }),
    });
    if (res.ok) {
      const entry = await res.json();
      setEntries((prev) => [...prev, entry]);
    }
  };

  const deleteEntry = async (id: string) => {
    const target = entries.find((e) => e.id === id);
    const name = target?.label?.trim() || "この行";
    if (!confirm(`「${name}」を売上集計から削除します。\nよろしいですか？（元に戻せません）`)) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await fetch("/api/sales", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };


  // ── 経費操作 ──
  const patchExpense = async (id: string, fields: Partial<ExpenseItem>) => {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    await fetch("/api/expenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    }).catch(() => {});
  };

  const addExpense = async () => {
    if (!newExpLabel.trim()) return;
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newExpLabel.trim(), amount: Number(numClean(newExpAmount)) || 0 }),
    });
    if (res.ok) {
      const item = await res.json();
      setExpenses((prev) => [...prev, item]);
      setNewExpLabel("");
      setNewExpAmount("");
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("この経費項目を削除しますか？")) return;
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await fetch("/api/expenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  // 取引先ごとの手数料％
  const feePctById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of salesClients) m.set(c.id, c.feePercent || 0);
    return m;
  }, [salesClients]);
  const feeOf = (e: SalesEntry) => {
    const pct = e.clientId ? (feePctById.get(e.clientId) || 0) : 0;
    return pct > 0 ? Math.round((e.sales * pct) / 100) : 0;
  };

  // ── 集計 ──
  const totals = useMemo(() => {
    const revenue = entries.reduce((s, e) => s + e.sales, 0);
    const material = entries.reduce((s, e) => s + e.material, 0);
    const outsource = entries.reduce((s, e) => s + e.outsource, 0);
    const fee = entries.reduce((s, e) => s + feeOf(e), 0);
    const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
    const cost = material + outsource + fee + expenseTotal;
    const gross = revenue - material - outsource - fee; // 粗利（固定費を引く前）
    return { revenue, material, outsource, fee, expenseTotal, cost, profit: revenue - cost, gross };
  }, [entries, expenses, feePctById]);

  if (status === "loading" || loading) {
    return <div className="min-h-full flex items-center justify-center bg-gray-900"><p className="text-gray-400">読み込み中...</p></div>;
  }
  if (role !== "ADMIN") return null;

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
      <Header />
      {/* 📄 依頼書原本ビューア */}
      {viewerDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={closeViewer}>
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-950/90 shrink-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-100 truncate flex-1 min-w-0">📄 {viewerDoc.label}</p>
            <a href={viewerDoc.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-sky-400 border border-sky-700 rounded-lg px-3 py-1.5 hover:bg-sky-900/40 transition shrink-0">
              別タブで開く
            </a>
            <button onClick={closeViewer}
              className="text-gray-400 hover:text-white text-xl leading-none px-2 shrink-0">✕</button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-gray-900" onClick={(e) => e.stopPropagation()}>
            {viewerDoc.error ? (
              <div className="text-center pt-16 space-y-3">
                <p className="text-sm text-gray-300">この画面では表示できませんでした</p>
                <a href={viewerDoc.url} target="_blank" rel="noopener noreferrer"
                  className="inline-block text-sm text-sky-300 border border-sky-700 rounded-lg px-4 py-2 hover:bg-sky-900/40 transition">
                  別タブで開く
                </a>
              </div>
            ) : !viewerDoc.objUrl ? (
              <p className="text-sm text-gray-400 text-center pt-16">読み込み中…</p>
            ) : viewerDoc.isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewerDoc.objUrl} alt="依頼書原本" className="w-full h-full object-contain" />
            ) : (
              <iframe src={viewerDoc.objUrl} title="依頼書原本" className="w-full h-full bg-white" />
            )}
          </div>
        </div>
      )}
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 py-4 sm:py-6">
        {/* ヘッダー行：タイトル・月切替 */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white">売上集計</h2>
          <div className="flex items-center justify-center gap-4 ml-auto">
            <button onClick={() => shiftMonth(-1)} className="text-gray-400 hover:text-white text-xl px-3 py-1">‹</button>
            <p className="text-lg font-bold text-white w-36 text-center">{monthLabel}</p>
            <button onClick={() => shiftMonth(1)} className="text-gray-400 hover:text-white text-xl px-3 py-1">›</button>
          </div>
          <a
            href={`/api/sales/pdf?month=${month}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs sm:text-sm bg-gray-800 text-gray-300 border border-gray-700 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-300 transition"
            title="この月の売上集計をPDFで開く"
          >📄 PDF</a>
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-5">
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 sm:py-4 text-center">
            <p className="text-xs sm:text-sm text-gray-400 mb-0.5">収益</p>
            <p className="text-base sm:text-2xl font-bold text-white">¥{fmt(totals.revenue)}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 sm:py-4 text-center">
            <p className="text-xs sm:text-sm text-gray-400 mb-0.5">粗利率</p>
            <p className={`text-base sm:text-2xl font-bold ${totals.gross < 0 ? "text-red-300" : (totals.revenue > 0 && (totals.gross / totals.revenue) * 100 <= 20) ? "text-orange-300" : "text-white"}`}>
              {totals.revenue > 0 ? `${Math.round((totals.gross / totals.revenue) * 100)}%` : "-"}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500">粗利 ¥{fmt(totals.gross)}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 sm:py-4 text-center">
            <p className="text-xs sm:text-sm text-gray-400 mb-0.5">経費</p>
            <p className="text-base sm:text-2xl font-bold text-white">¥{fmt(totals.cost)}</p>
          </div>
          <div className={`rounded-xl px-3 py-3 sm:py-4 text-center border ${totals.profit >= 0 ? "bg-emerald-900/40 border-emerald-700" : "bg-red-900/40 border-red-700"}`}>
            <p className="text-xs sm:text-sm text-gray-400 mb-0.5">利益</p>
            <p className={`text-base sm:text-2xl font-bold ${totals.profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>¥{fmt(totals.profit)}</p>
          </div>
        </div>

        {/* 📈 推移グラフ（折りたたみ） */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-5">
          <button onClick={toggleTrend} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-700/40 transition">
            <p className="text-sm font-bold text-gray-100">📈 売上・経費・利益の推移</p>
            <span className="text-xs text-gray-400">{showTrend ? "▲" : "▼"}</span>
          </button>
          {showTrend && (
            <div className="border-t border-gray-700 px-2 sm:px-4 py-3">
              {trend === null ? (
                <p className="text-xs text-gray-500 text-center py-6">読み込み中…</p>
              ) : trend.length < 2 ? (
                <p className="text-xs text-gray-500 text-center py-6">まだ2ヶ月分のデータがありません</p>
              ) : (
                <TrendChart data={trend} />
              )}
            </div>
          )}
        </div>

        {/* カテゴリ別明細（PCでは2列） */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 items-start">
          {[
            ...salesClients.map((c) => ({ key: c.id as string | null, name: c.name, color: c.color, fee: c.feePercent || 0 })),
            { key: null as string | null, name: "その他", color: null, fee: 0 },
          ].filter((card) => card.key !== null || entries.some((e) => !e.clientId)).map(({ key, name, color, fee: cardFee }) => {
            const rows = entries.filter((e) => (key === null ? !e.clientId : e.clientId === key));
            const sub = {
              sales: rows.reduce((s, e) => s + e.sales, 0),
              material: rows.reduce((s, e) => s + e.material, 0),
              outsource: rows.reduce((s, e) => s + e.outsource, 0),
            };
            const subFee = cardFee > 0 ? Math.round((sub.sales * cardFee) / 100) : 0;
            const subProfit = sub.sales - sub.material - sub.outsource - subFee;
            return (
              <div key={key ?? "__other__"} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-2.5 sm:px-4 py-2.5 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between gap-1">
                  <p className="text-xs sm:text-sm font-bold text-gray-100 truncate flex items-center gap-1.5">
                    {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
                    <span className="truncate">{name}</span>
                    {cardFee > 0 && <span className="text-[10px] font-normal text-orange-300 bg-orange-900/40 border border-orange-800 rounded px-1 shrink-0">手数料{cardFee}%</span>}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-400 shrink-0">
                    {rows.filter((e) => e.invoiced).length > 0 && (
                      <span className="text-green-400 mr-1">請求済{rows.filter((e) => e.invoiced).length}</span>
                    )}
                    {rows.length}件
                  </p>
                </div>

                {rows.length > 0 && (
                  <>
                    {/* 列見出し */}
                    <div className="grid grid-cols-[16px_minmax(0,1fr)_20px_58px_14px] sm:grid-cols-[22px_minmax(160px,1fr)_26px_96px_90px_90px_84px_24px] sm:gap-2 gap-1 px-2 sm:px-3 pt-2 pb-1 text-[10px] text-gray-500">
                      <span title="請求書送付済み">📨</span>
                      <span>建物名</span>
                      <span title="依頼書原本"></span>
                      <span className="text-right">売上</span>
                      <span className="hidden sm:block text-right">材料費</span>
                      <span className="hidden sm:block text-right">外注費</span>
                      <span className="hidden sm:block text-right">利益</span>
                      <span></span>
                    </div>
                    <div className="divide-y divide-gray-700/60">
                      {rows.map((e) => {
                        const rowFee = feeOf(e);
                        const profit = e.sales - e.material - e.outsource - rowFee;
                        const hasBd = Array.isArray(e.salesBreakdown) && e.salesBreakdown.length > 0;
                        const showBdButton = !!e.projectId; // 案件に紐づく行は全て内訳を見られる
                        return (
                          <div key={e.id}>
                          <div className={`grid grid-cols-[16px_minmax(0,1fr)_20px_58px_14px] sm:grid-cols-[22px_minmax(160px,1fr)_26px_96px_90px_90px_84px_24px] sm:gap-2 gap-1 items-center px-2 sm:px-3 py-1.5 ${e.invoiced ? "bg-green-950/20" : ""}`}>
                            <button
                              onClick={() => patchEntry(e.id, { invoiced: !e.invoiced })}
                              title={e.invoiced ? "請求書送付済み（タップで取り消し）" : "請求書を送ったらタップ"}
                              className={`w-4 h-4 sm:w-[18px] sm:h-[18px] rounded border flex items-center justify-center text-[10px] leading-none transition ${
                                e.invoiced
                                  ? "bg-green-600 border-green-600 text-white"
                                  : "bg-gray-900 border-gray-600 text-transparent hover:border-green-500"
                              }`}
                            >
                              ✓
                            </button>
                            {e.projectId ? (
                              <div className="min-w-0 flex items-center gap-1.5">
                                <Link
                                  href={`/projects/${e.projectId}`}
                                  title={`${e.label || "案件"}（タップで案件情報を表示）`}
                                  className={`min-w-0 text-xs sm:text-sm py-1 truncate hover:underline flex items-center gap-1 ${e.invoiced ? "text-gray-400" : "text-sky-300"}`}
                                >
                                  <span className="truncate">{e.label || "（無題）"}</span>
                                  <span className="text-sky-500 shrink-0">›</span>
                                </Link>
                                {showBdButton && (
                                  <button
                                    onClick={() => setOpenBreakdownId(openBreakdownId === e.id ? null : e.id)}
                                    title="作業日・作業名・金額を表示（請求書作成用）"
                                    className={`shrink-0 text-[10px] leading-none rounded-full px-2 py-1 border font-medium transition ${openBreakdownId === e.id ? "bg-amber-600 text-white border-amber-600" : "text-amber-300 border-amber-700 hover:bg-amber-900/30"}`}
                                  >内訳</button>
                                )}
                              </div>
                            ) : (
                              <input
                                value={e.label}
                                disabled={e.invoiced}
                                title={e.invoiced ? "請求済みのためロック中（✓を外すと編集できます）" : undefined}
                                onChange={(ev) => setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, label: ev.target.value } : x)))}
                                onBlur={(ev) => patchEntry(e.id, { label: ev.target.value })}
                                placeholder="建物名"
                                className={`min-w-0 bg-transparent text-xs sm:text-sm border-b border-transparent focus:border-blue-500 focus:outline-none py-1 truncate ${e.invoiced ? "text-gray-500" : "text-gray-100"}`}
                              />
                            )}
                            {e.docUrl ? (
                              <button
                                onClick={() => openViewer(e.docUrl!, e.label || "依頼書", e.docName)}
                                title="依頼書原本を表示"
                                className="text-sky-500 hover:text-sky-300 text-sm leading-none transition"
                              >
                                📄
                              </button>
                            ) : (
                              <span></span>
                            )}
                            {(["sales", "material", "outsource"] as const).map((f) => (
                              <input
                                key={f}
                                type="text"
                                inputMode="numeric"
                                value={e[f] === 0 ? "" : fmt(e[f])}
                                onChange={(ev) => {
                                  const v = Number(numClean(ev.target.value)) || 0;
                                  setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, [f]: v } : x)));
                                }}
                                onBlur={(ev) => patchEntry(e.id, { [f]: Number(numClean(ev.target.value)) || 0 })}
                                placeholder="0"
                                disabled={e.invoiced}
                                title={e.invoiced ? "請求済みのためロック中（✓を外すと編集できます）" : undefined}
                                className={`min-w-0 text-xs sm:text-sm text-right rounded px-1.5 py-1 border focus:border-blue-500 focus:outline-none ${f !== "sales" ? "hidden sm:block" : ""} ${e.invoiced ? "bg-gray-900/30 text-gray-500 border-gray-800" : "bg-gray-900/60 text-gray-100 border-gray-700"}`}
                              />
                            ))}
                            <span className={`hidden sm:block text-right font-medium ${profit < 0 ? "text-red-400" : (e.sales > 0 && (profit / e.sales) * 100 <= 20) ? "text-orange-400" : "text-emerald-400"}`}>
                              <span className="text-xs sm:text-sm">{fmt(profit)}</span>
                              {e.sales > 0 && (
                                <span className="block text-[10px] leading-tight opacity-70">{Math.round((profit / e.sales) * 100)}%</span>
                              )}
                            </span>
                            {e.invoiced ? (
                              <span className="text-gray-700 text-xs" title="請求済みのためロック中">🔒</span>
                            ) : (
                              <button onClick={() => deleteEntry(e.id)} className="text-gray-600 hover:text-red-500 text-xs">✕</button>
                            )}
                          </div>
                          {/* 内訳: 作業日・作業名・金額（請求書作成の参考） */}
                          {showBdButton && openBreakdownId === e.id && (
                            <div className="mx-2 sm:mx-3 mb-1.5 bg-amber-950/30 border border-amber-800/60 rounded-lg px-3 py-2 space-y-1">
                              {hasBd ? (
                                e.salesBreakdown!.map((r, i) => (
                                  <div key={i} className="flex items-center gap-3 text-xs">
                                    <span className="text-amber-300 shrink-0 w-10">{r.date ? new Date(r.date + "T00:00:00").toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "-"}</span>
                                    <span className="text-gray-200 flex-1 min-w-0 truncate">{r.label || "（作業名なし）"}</span>
                                    <span className="text-gray-100 font-medium shrink-0">¥{(r.amount || 0).toLocaleString()}</span>
                                  </div>
                                ))
                              ) : (
                                <>
                                  {(e.workDates.length > 0 ? e.workDates : [""]).map((d, i) => (
                                    <div key={i} className="flex items-center gap-3 text-xs">
                                      <span className="text-amber-300 shrink-0 w-10">{d ? new Date(d + "T00:00:00").toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "-"}</span>
                                      <span className="text-gray-200 flex-1 min-w-0 truncate">{e.workType || "（依頼名なし）"}</span>
                                      {(e.workDates.length <= 1 || i === 0) && e.workDates.length <= 1 ? (
                                        <span className="text-gray-100 font-medium shrink-0">¥{(e.sales || 0).toLocaleString()}</span>
                                      ) : (
                                        <span className="text-gray-600 shrink-0">—</span>
                                      )}
                                    </div>
                                  ))}
                                  {e.workDates.length > 1 && (
                                    <div className="flex items-center gap-3 text-xs border-t border-amber-900/50 pt-1">
                                      <span className="shrink-0 w-10"></span>
                                      <span className="text-gray-400 flex-1">合計（日別の金額は案件の編集で設定できます）</span>
                                      <span className="text-gray-100 font-medium shrink-0">¥{(e.sales || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                          </div>
                        );
                      })}
                    </div>
                    {/* 手数料（取引先に手数料設定がある場合） */}
                    {cardFee > 0 && (
                      <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 bg-gray-900/30 border-t border-gray-700/60 text-xs">
                        <span className="text-orange-300">プラットフォーム手数料（{cardFee}%）</span>
                        <span className="text-orange-300 font-medium">-¥{fmt(subFee)}</span>
                      </div>
                    )}
                    {/* 小計 */}
                    <div className="grid grid-cols-[16px_minmax(0,1fr)_20px_58px_14px] sm:grid-cols-[22px_minmax(160px,1fr)_26px_96px_90px_90px_84px_24px] sm:gap-2 gap-1 px-2 sm:px-3 py-2 bg-gray-900/50 border-t border-gray-700 text-xs sm:text-sm font-bold">
                      <span></span>
                      <span className="text-gray-400">小計</span>
                      <span></span>
                      <span className="text-right text-gray-100">{fmt(sub.sales)}</span>
                      <span className="hidden sm:block text-right text-gray-300">{fmt(sub.material)}</span>
                      <span className="hidden sm:block text-right text-gray-300">{fmt(sub.outsource)}</span>
                      <span className={`hidden sm:block text-right ${subProfit < 0 ? "text-red-400" : (sub.sales > 0 && (subProfit / sub.sales) * 100 <= 20) ? "text-orange-400" : "text-emerald-400"}`}>
                        {fmt(subProfit)}
                        {sub.sales > 0 && <span className="block text-[10px] font-normal leading-tight opacity-70">{Math.round((subProfit / sub.sales) * 100)}%</span>}
                      </span>
                      <span></span>
                    </div>
                  </>
                )}

                <button
                  onClick={() => addEntry(key)}
                  className="w-full text-xs text-blue-400 hover:bg-gray-700/50 py-2 transition"
                >
                  ＋ 行を追加
                </button>
              </div>
            );
          })}

          {/* 経費一覧（毎月共通） */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden xl:col-span-2">
            <button
              onClick={() => setShowExpenses((v) => !v)}
              className="w-full px-4 py-2.5 bg-gray-800/50 flex items-center justify-between hover:bg-gray-700/50 transition"
            >
              <p className="text-sm font-bold text-gray-100">経費一覧（毎月）</p>
              <p className="text-xs text-gray-400">
                ¥{fmt(totals.expenseTotal)} <span className="ml-1">{showExpenses ? "▲" : "▼"}</span>
              </p>
            </button>
            {showExpenses && (
              <div className="border-t border-gray-700">
                <div className="divide-y divide-gray-700/60">
                  {expenses.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 px-3 py-1.5">
                      <input
                        value={e.label}
                        onChange={(ev) => setExpenses((prev) => prev.map((x) => (x.id === e.id ? { ...x, label: ev.target.value } : x)))}
                        onBlur={(ev) => patchExpense(e.id, { label: ev.target.value })}
                        className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-gray-100 border-b border-transparent focus:border-blue-500 focus:outline-none py-1"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={e.amount === 0 ? "" : fmt(e.amount)}
                        onChange={(ev) => {
                          const v = Number(numClean(ev.target.value)) || 0;
                          setExpenses((prev) => prev.map((x) => (x.id === e.id ? { ...x, amount: v } : x)));
                        }}
                        onBlur={(ev) => patchExpense(e.id, { amount: Number(numClean(ev.target.value)) || 0 })}
                        placeholder="0"
                        className="w-24 bg-gray-900/60 text-xs sm:text-sm text-gray-100 text-right rounded px-1.5 py-1 border border-gray-700 focus:border-blue-500 focus:outline-none"
                      />
                      <button onClick={() => deleteExpense(e.id)} className="text-gray-600 hover:text-red-500 text-xs">✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700">
                  <input
                    value={newExpLabel}
                    onChange={(e) => setNewExpLabel(e.target.value)}
                    placeholder="項目名（例: ガソリン代）"
                    className="flex-1 min-w-0 bg-gray-900/60 text-xs sm:text-sm text-gray-100 rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newExpAmount}
                    onChange={(e) => setNewExpAmount(numClean(e.target.value))}
                    placeholder="金額"
                    className="w-24 bg-gray-900/60 text-xs sm:text-sm text-gray-100 text-right rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={addExpense}
                    disabled={!newExpLabel.trim()}
                    className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-40 transition"
                  >追加</button>
                </div>
                <p className="text-[10px] text-gray-500 px-3 pb-2">※ 経費は毎月共通で全ての月の集計に使われます</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


// ── 📈 推移グラフ（SVG・ライブラリ不使用） ──
function TrendChart({ data }: { data: { month: string; revenue: number; cost: number; profit: number; profitRate: number | null }[] }) {
  // 検証済みパレット（ダーク面 #1f2937）: 売上=青 / 経費=アンバー / 利益=緑
  const C = { revenue: "#3b82f6", cost: "#d97706", profit: "#059669" };
  const W = Math.max(360, data.length * 56);
  const H = 220;
  const PAD_L = 44, PAD_R = 12, PAD_T = 12, PAD_B = 44;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const vals = data.flatMap((d) => [d.revenue, d.cost, d.profit]);
  const maxV = Math.max(...vals, 1);
  const minV = Math.min(...vals, 0);
  const span = maxV - minV || 1;
  const y = (v: number) => PAD_T + plotH - ((v - minV) / span) * plotH;
  const x = (i: number) => PAD_L + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);

  // y軸目盛り（万円単位で4本）
  const ticks = [0, 1, 2, 3, 4].map((i) => minV + (span * i) / 4);
  const fmtMan = (v: number) => `${Math.round(v / 10000)}万`;
  const fmtYen = (v: number) => `¥${v.toLocaleString()}`;
  const line = (key: "revenue" | "cost" | "profit") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const monthLabel = (m: string) => `${parseInt(m.split("-")[1])}月`;

  return (
    <div>
      {/* 凡例 */}
      <div className="flex gap-4 flex-wrap px-2 mb-1">
        {([["revenue", "売上"], ["cost", "経費"], ["profit", "利益"]] as const).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: C[k] }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs text-gray-500 ml-auto">下段：利益率</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} className="w-full h-auto" role="img" aria-label="売上・経費・利益の月別推移">
          {/* グリッド＋y軸ラベル */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="#374151" strokeWidth="1" />
              <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#6b7280">{fmtMan(t)}</text>
            </g>
          ))}
          {/* 0ライン強調（マイナス月がある場合） */}
          {minV < 0 && <line x1={PAD_L} x2={W - PAD_R} y1={y(0)} y2={y(0)} stroke="#4b5563" strokeWidth="1.5" />}
          {/* ライン */}
          <path d={line("revenue")} fill="none" stroke={C.revenue} strokeWidth="2" />
          <path d={line("cost")} fill="none" stroke={C.cost} strokeWidth="2" strokeDasharray="5 3" />
          <path d={line("profit")} fill="none" stroke={C.profit} strokeWidth="2.5" />
          {/* マーカー（形状でも区別: 売上=丸 / 経費=四角 / 利益=丸大） */}
          {data.map((d, i) => (
            <g key={d.month}>
              <circle cx={x(i)} cy={y(d.revenue)} r="3.5" fill={C.revenue} stroke="#1f2937" strokeWidth="1.5">
                <title>{`${monthLabel(d.month)} 売上 ${fmtYen(d.revenue)}`}</title>
              </circle>
              <rect x={x(i) - 3} y={y(d.cost) - 3} width="6" height="6" fill={C.cost} stroke="#1f2937" strokeWidth="1.5">
                <title>{`${monthLabel(d.month)} 経費 ${fmtYen(d.cost)}`}</title>
              </rect>
              <circle cx={x(i)} cy={y(d.profit)} r="4.5" fill={C.profit} stroke="#1f2937" strokeWidth="1.5">
                <title>{`${monthLabel(d.month)} 利益 ${fmtYen(d.profit)}（利益率${d.profitRate ?? "-"}%）`}</title>
              </circle>
              {/* x軸: 月 ＋ 利益率 */}
              <text x={x(i)} y={H - 26} textAnchor="middle" fontSize="10" fill="#9ca3af">{monthLabel(d.month)}</text>
              <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="9" fontWeight="bold"
                fill={d.profitRate == null ? "#6b7280" : d.profitRate >= 0 ? "#34d399" : "#f87171"}>
                {d.profitRate == null ? "-" : `${d.profitRate}%`}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
