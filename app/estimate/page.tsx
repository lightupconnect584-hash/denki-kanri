"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface Category {
  id: string;
  name: string;
  order: number;
}

interface ReplacementModel {
  id: string;
  existingModel: string;
  replacementModel: string;
  maker: string | null;
  color: string | null;
  price: number | null;
  replacementCost: number | null;
  relatedParts: string[];
  notes: string | null;
  category: Category | null;
}

interface EstimateItem {
  model: ReplacementModel;
  qty: number;
  includeReplacement: boolean;
  customPrice: string; // 単価を上書きする場合
}

export default function EstimatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string })?.role;

  const [models, setModels] = useState<ReplacementModel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filteredModels, setFilteredModels] = useState<ReplacementModel[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string>("");

  const [items, setItems] = useState<EstimateItem[]>([]);
  const [taxRate, setTaxRate] = useState<10 | 8>(10);
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  const fetchModels = useCallback(async () => {
    const [modelsRes, catsRes] = await Promise.all([
      fetch("/api/replacement-models"),
      fetch("/api/replacement-categories"),
    ]);
    const modelsData = await modelsRes.json();
    const catsData = await catsRes.json();
    setModels(modelsData.items || []);
    setCategories(catsData || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && role === "ADMIN") fetchModels();
  }, [status, role, fetchModels]);

  // 検索フィルタ
  useEffect(() => {
    const q = query.trim().toLowerCase();
    const catFilter = models.filter(m => !pickerCategory || m.category?.id === pickerCategory);
    if (!q) {
      setFilteredModels(catFilter);
    } else {
      setFilteredModels(catFilter.filter(m =>
        m.existingModel.toLowerCase().includes(q) ||
        m.replacementModel.toLowerCase().includes(q) ||
        (m.maker?.toLowerCase() || "").includes(q)
      ));
    }
  }, [query, models, pickerCategory]);

  const addItem = (model: ReplacementModel) => {
    // 既に追加済みならQTY +1
    const existing = items.findIndex(i => i.model.id === model.id);
    if (existing >= 0) {
      const updated = [...items];
      updated[existing] = { ...updated[existing], qty: updated[existing].qty + 1 };
      setItems(updated);
    } else {
      setItems(prev => [...prev, { model, qty: 1, includeReplacement: true, customPrice: "" }]);
    }
    setShowPicker(false);
    setQuery("");
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, patch: Partial<EstimateItem>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  // 金額計算
  const calcItemTotal = (item: EstimateItem) => {
    const unitPrice = item.customPrice !== "" ? (parseInt(item.customPrice) || 0) : (item.model.price || 0);
    const replacementCost = item.includeReplacement ? (item.model.replacementCost || 0) : 0;
    return (unitPrice + replacementCost) * item.qty;
  };

  const subtotal = items.reduce((sum, item) => sum + calcItemTotal(item), 0);
  const tax = Math.floor(subtotal * taxRate / 100);
  const total = subtotal + tax;

  // カテゴリ別グループ
  const grouped = (() => {
    const map = new Map<string, { cat: Category | null; models: ReplacementModel[] }>();
    categories.forEach(c => map.set(c.id, { cat: c, models: [] }));
    map.set("__none__", { cat: null, models: [] });
    filteredModels.forEach(m => {
      const key = m.category?.id || "__none__";
      if (!map.has(key)) map.set(key, { cat: m.category, models: [] });
      map.get(key)!.models.push(m);
    });
    return Array.from(map.entries()).filter(([, v]) => v.models.length > 0);
  })();

  const inputClass = "w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (status === "loading" || loading) {
    return <div className="min-h-full flex items-center justify-center bg-gray-900"><p className="text-gray-400">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 sm:py-6 pb-24">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white flex-1">簡易見積り</h2>
          <span className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700 rounded px-2 py-1">管理者専用</span>
        </div>

        {/* 明細追加ボタン */}
        <button
          onClick={() => setShowPicker(true)}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-xl py-3 text-gray-400 hover:text-blue-400 transition text-sm mb-4"
        >
          <span className="text-lg">＋</span>
          機種を追加
        </button>

        {/* 見積り明細 */}
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">機種を追加して見積りを作成</p>
          </div>
        ) : (
          <div className="space-y-3 mb-4">
            {items.map((item, idx) => {
              const unitPrice = item.customPrice !== "" ? (parseInt(item.customPrice) || 0) : (item.model.price || 0);
              const replaceCost = item.model.replacementCost || 0;
              const lineTotal = calcItemTotal(item);
              return (
                <div key={idx} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-100 truncate">{item.model.existingModel}</p>
                      <p className="text-xs text-blue-400 truncate">→ {item.model.replacementModel}</p>
                      {item.model.maker && <p className="text-xs text-gray-400">{item.model.maker}</p>}
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-gray-500 hover:text-red-400 transition shrink-0">✕</button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* 数量 */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">数量</label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateItem(idx, { qty: Math.max(1, item.qty - 1) })}
                          className="w-7 h-7 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 flex items-center justify-center text-sm"
                        >−</button>
                        <span className="text-sm font-bold text-gray-100 w-6 text-center">{item.qty}</span>
                        <button
                          onClick={() => updateItem(idx, { qty: item.qty + 1 })}
                          className="w-7 h-7 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 flex items-center justify-center text-sm"
                        >＋</button>
                      </div>
                    </div>

                    {/* 単価（上書き可） */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        単価（材料費）
                        {item.model.price != null && <span className="text-gray-500"> ¥{item.model.price.toLocaleString()}</span>}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={item.model.price != null ? String(item.model.price) : "未設定"}
                        value={item.customPrice}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");
                          updateItem(idx, { customPrice: v });
                        }}
                        className="w-full border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-100 bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* 交換金額 */}
                  {replaceCost > 0 && (
                    <label className="flex items-center gap-2 mb-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.includeReplacement}
                        onChange={(e) => updateItem(idx, { includeReplacement: e.target.checked })}
                        className="rounded border-gray-600"
                      />
                      <span className="text-xs text-gray-300">
                        工賃を含む（¥{replaceCost.toLocaleString()}）
                      </span>
                    </label>
                  )}

                  {/* 小計 */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                    <span className="text-xs text-gray-400">小計（税別）</span>
                    <span className="text-sm font-bold text-white">¥{lineTotal.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* メモ欄 */}
        {items.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
            <label className="block text-xs text-gray-400 mb-2">メモ・備考</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="特記事項など"
              rows={2}
              className={inputClass}
            />
          </div>
        )}

        {/* 合計 */}
        {items.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">税抜合計</span>
              <span className="text-sm text-gray-100">¥{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">消費税</span>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value) as 10 | 8)}
                  className="text-xs bg-gray-700 border border-gray-600 text-gray-300 rounded px-2 py-0.5"
                >
                  <option value={10}>10%</option>
                  <option value={8}>8%</option>
                </select>
              </div>
              <span className="text-sm text-gray-100">¥{tax.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-600">
              <span className="text-base font-bold text-white">税込合計</span>
              <span className="text-xl font-bold text-blue-400">¥{total.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* リセット */}
        {items.length > 0 && (
          <button
            onClick={() => { setItems([]); setMemo(""); }}
            className="w-full text-xs text-gray-500 hover:text-red-400 transition py-2"
          >
            リセット
          </button>
        )}

        {/* ===== 機種選択モーダル ===== */}
        {showPicker && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
            <div className="bg-gray-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                <h3 className="font-bold text-gray-100">機種を選択</h3>
                <button onClick={() => { setShowPicker(false); setQuery(""); }} className="text-gray-400 hover:text-gray-300 text-xl">✕</button>
              </div>

              {/* 検索 */}
              <div className="px-5 pb-3 shrink-0 space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="型番・メーカーで検索"
                  className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => setPickerCategory("")}
                    className={`shrink-0 text-xs rounded-full px-3 py-1 border transition ${
                      pickerCategory === "" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-700 text-gray-300 border-gray-600"
                    }`}
                  >
                    すべて
                  </button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setPickerCategory(c.id)}
                      className={`shrink-0 text-xs rounded-full px-3 py-1 border transition ${
                        pickerCategory === c.id ? "bg-blue-600 text-white border-blue-600" : "bg-gray-700 text-gray-300 border-gray-600"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* リスト */}
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {filteredModels.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">該当する機種がありません</p>
                ) : (
                  grouped.map(([key, { cat, models: catModels }]) => (
                    <div key={key} className="mb-2">
                      {cat && <p className="text-xs text-gray-500 font-medium px-2 py-1 sticky top-0 bg-gray-800">{cat.name}</p>}
                      {catModels.map(m => {
                        const hasPrice = m.price != null || m.replacementCost != null;
                        return (
                          <button
                            key={m.id}
                            onClick={() => addItem(m)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-700 transition text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-100 truncate">{m.existingModel}</p>
                              <p className="text-xs text-blue-400 truncate">→ {m.replacementModel}</p>
                              {m.maker && <p className="text-xs text-gray-500">{m.maker}</p>}
                            </div>
                            {hasPrice && (
                              <div className="text-right shrink-0">
                                {m.price != null && <p className="text-xs text-gray-300">材料 ¥{m.price.toLocaleString()}</p>}
                                {m.replacementCost != null && <p className="text-xs text-gray-400">工賃 ¥{m.replacementCost.toLocaleString()}</p>}
                              </div>
                            )}
                            {!hasPrice && (
                              <span className="text-xs text-gray-600 shrink-0">金額未設定</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
