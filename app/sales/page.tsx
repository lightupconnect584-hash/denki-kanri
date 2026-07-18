"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  projectId: string | null;
}

interface ExpenseItem {
  id: string;
  label: string;
  amount: number;
}

const CATEGORY_DEFS: { key: string; name: string; short: string }[] = [
  { key: "SEKISUI_KITA", name: "積水ハウス 北関東", short: "北" },
  { key: "SEKISUI_SAITAMA", name: "積水ハウス 埼玉", short: "埼" },
  { key: "PERSONAL", name: "個人", short: "個" },
  { key: "OTHER", name: "その他", short: "他" },
];

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
  const [loading, setLoading] = useState(true);
  const [showExpenses, setShowExpenses] = useState(false);
  const [newExpLabel, setNewExpLabel] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && role && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  const fetchData = useCallback(async (m: string) => {
    setLoading(true);
    const res = await fetch(`/api/sales?month=${m}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries || []);
      setExpenses(data.expenses || []);
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

  const addEntry = async (category: string) => {
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth: month, category }),
    });
    if (res.ok) {
      const entry = await res.json();
      setEntries((prev) => [...prev, entry]);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("この行を削除しますか？")) return;
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

  // ── 集計 ──
  const totals = useMemo(() => {
    const revenue = entries.reduce((s, e) => s + e.sales, 0);
    const material = entries.reduce((s, e) => s + e.material, 0);
    const outsource = entries.reduce((s, e) => s + e.outsource, 0);
    const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
    const cost = material + outsource + expenseTotal;
    return { revenue, material, outsource, expenseTotal, cost, profit: revenue - cost };
  }, [entries, expenses]);

  if (status === "loading" || loading) {
    return <div className="min-h-full flex items-center justify-center bg-gray-900"><p className="text-gray-400">読み込み中...</p></div>;
  }
  if (role !== "ADMIN") return null;

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 sm:py-6">
        {/* ヘッダー行：タイトル・月切替 */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white">売上集計</h2>
          <div className="flex items-center justify-center gap-4 ml-auto">
            <button onClick={() => shiftMonth(-1)} className="text-gray-400 hover:text-white text-xl px-3 py-1">‹</button>
            <p className="text-lg font-bold text-white w-36 text-center">{monthLabel}</p>
            <button onClick={() => shiftMonth(1)} className="text-gray-400 hover:text-white text-xl px-3 py-1">›</button>
          </div>
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5">
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 sm:py-4 text-center">
            <p className="text-xs sm:text-sm text-gray-400 mb-0.5">収益</p>
            <p className="text-base sm:text-2xl font-bold text-white">¥{fmt(totals.revenue)}</p>
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

        {/* カテゴリ別明細（PCでは2列） */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 items-start">
          {CATEGORY_DEFS.map(({ key, name }) => {
            const rows = entries.filter((e) => e.category === key);
            const sub = {
              sales: rows.reduce((s, e) => s + e.sales, 0),
              material: rows.reduce((s, e) => s + e.material, 0),
              outsource: rows.reduce((s, e) => s + e.outsource, 0),
            };
            const subProfit = sub.sales - sub.material - sub.outsource;
            return (
              <div key={key} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-2.5 sm:px-4 py-2.5 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between gap-1">
                  <p className="text-xs sm:text-sm font-bold text-gray-100 truncate">{name}</p>
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
                    <div className="grid grid-cols-[16px_1fr_58px_14px] sm:grid-cols-[22px_1fr_110px_100px_100px_95px_28px] sm:gap-2 gap-1 px-2 sm:px-3 pt-2 pb-1 text-[10px] text-gray-500">
                      <span title="請求書送付済み">📨</span>
                      <span>建物名</span>
                      <span className="text-right">売上</span>
                      <span className="hidden sm:block text-right">材料費</span>
                      <span className="hidden sm:block text-right">外注費</span>
                      <span className="hidden sm:block text-right">利益</span>
                      <span></span>
                    </div>
                    <div className="divide-y divide-gray-700/60">
                      {rows.map((e) => {
                        const profit = e.sales - e.material - e.outsource;
                        return (
                          <div key={e.id} className={`grid grid-cols-[16px_1fr_58px_14px] sm:grid-cols-[22px_1fr_110px_100px_100px_95px_28px] sm:gap-2 gap-1 items-center px-2 sm:px-3 py-1.5 ${e.invoiced ? "bg-green-950/20" : ""}`}>
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
                            <input
                              value={e.label}
                              onChange={(ev) => setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, label: ev.target.value } : x)))}
                              onBlur={(ev) => patchEntry(e.id, { label: ev.target.value })}
                              placeholder="建物名"
                              className={`min-w-0 bg-transparent text-xs sm:text-sm border-b border-transparent focus:border-blue-500 focus:outline-none py-1 truncate ${e.invoiced ? "text-gray-500" : "text-gray-100"}`}
                            />
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
                                className={`min-w-0 bg-gray-900/60 text-xs sm:text-sm text-gray-100 text-right rounded px-1.5 py-1 border border-gray-700 focus:border-blue-500 focus:outline-none ${f !== "sales" ? "hidden sm:block" : ""}`}
                              />
                            ))}
                            <span className={`hidden sm:block text-xs sm:text-sm text-right font-medium ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {fmt(profit)}
                            </span>
                            <button onClick={() => deleteEntry(e.id)} className="text-gray-600 hover:text-red-500 text-xs">✕</button>
                          </div>
                        );
                      })}
                    </div>
                    {/* 小計 */}
                    <div className="grid grid-cols-[16px_1fr_58px_14px] sm:grid-cols-[22px_1fr_110px_100px_100px_95px_28px] sm:gap-2 gap-1 px-2 sm:px-3 py-2 bg-gray-900/50 border-t border-gray-700 text-xs sm:text-sm font-bold">
                      <span></span>
                      <span className="text-gray-400">小計</span>
                      <span className="text-right text-gray-100">{fmt(sub.sales)}</span>
                      <span className="hidden sm:block text-right text-gray-300">{fmt(sub.material)}</span>
                      <span className="hidden sm:block text-right text-gray-300">{fmt(sub.outsource)}</span>
                      <span className={`hidden sm:block text-right ${subProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(subProfit)}</span>
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
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden col-span-2">
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
