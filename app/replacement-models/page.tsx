"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

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
  updatedOn: string | null;
  createdAt: string;
}

interface RelatedProject {
  id: string;
  title: string;
  location: string;
  workType: string | null;
  status: string;
}

const emptyForm = {
  existingModel: "",
  replacementModel: "",
  maker: "",
  color: "",
  price: "",
  replacementCost: "",
  relatedPartsInput: "",
  relatedParts: [] as string[],
  notes: "",
  updatedOn: "",
};

export default function ReplacementModelsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [items, setItems] = useState<ReplacementModel[]>([]);
  const [relatedProjects, setRelatedProjects] = useState<RelatedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchAll = useCallback(async (q: string) => {
    setLoading(true);
    const res = await fetch(`/api/replacement-models?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setItems(data.items || []);
    setRelatedProjects(data.relatedProjects || []);
    setSearched(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchAll("");
  }, [status, fetchAll]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAll(query);
  };

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item: ReplacementModel) => {
    setForm({
      existingModel: item.existingModel,
      replacementModel: item.replacementModel,
      maker: item.maker || "",
      color: item.color || "",
      price: item.price != null ? String(item.price) : "",
      replacementCost: item.replacementCost != null ? String(item.replacementCost) : "",
      relatedPartsInput: "",
      relatedParts: item.relatedParts,
      notes: item.notes || "",
      updatedOn: item.updatedOn ? item.updatedOn.slice(0, 10) : "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const addPart = () => {
    const part = form.relatedPartsInput.trim();
    if (!part) return;
    setForm({ ...form, relatedParts: [...form.relatedParts, part], relatedPartsInput: "" });
  };

  const removePart = (i: number) => {
    setForm({ ...form, relatedParts: form.relatedParts.filter((_, idx) => idx !== i) });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      ...(editingId ? { id: editingId } : {}),
      existingModel: form.existingModel,
      replacementModel: form.replacementModel,
      maker: form.maker,
      color: form.color,
      price: form.price,
      replacementCost: form.replacementCost,
      relatedParts: form.relatedParts,
      notes: form.notes,
      updatedOn: form.updatedOn || null,
    };
    const res = await fetch("/api/replacement-models", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowForm(false);
      setEditingId(null);
      fetchAll(query);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/replacement-models?id=${id}`, { method: "DELETE" });
    setDeleteConfirmId(null);
    fetchAll(query);
  };

  const numInput = (val: string, field: "price" | "replacementCost") => {
    const v = val.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");
    setForm({ ...form, [field]: v });
  };

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (status === "loading") return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">読み込み中...</p></div>;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white flex-1">交換機種表</h2>
          <button onClick={openNew} className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition">＋ 追加</button>
        </div>

        {/* 検索 */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="型番・メーカーで検索"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 transition">検索</button>
          {query && (
            <button type="button" onClick={() => { setQuery(""); fetchAll(""); }} className="text-gray-400 hover:text-white text-sm px-2">✕</button>
          )}
        </form>

        {/* 機種一覧 */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>
        ) : items.length === 0 && searched ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-3">🔌</p>
            <p>{query ? "該当する機種が見つかりませんでした" : "まだ登録がありません"}</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
                      <span className="text-xs text-gray-400">既存</span>
                      <span className="text-sm font-bold text-gray-800">{item.existingModel}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-xs text-gray-400">後継</span>
                      <span className="text-sm font-bold text-blue-700">{item.replacementModel}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-1">
                      {item.maker && <span>メーカー: {item.maker}</span>}
                      {item.color && <span>色: {item.color}</span>}
                      {item.updatedOn && <span>更新日: {new Date(item.updatedOn).toLocaleDateString("ja-JP")}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-1">
                      {item.price != null && <span>金額（税別）: ¥{item.price.toLocaleString()}</span>}
                      {item.replacementCost != null && <span>交換金額（税別）: ¥{item.replacementCost.toLocaleString()}</span>}
                    </div>
                    {item.relatedParts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {item.relatedParts.map((p, i) => (
                          <span key={i} className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{p}</span>
                        ))}
                      </div>
                    )}
                    {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(item)} className="text-xs text-blue-600 hover:underline">編集</button>
                    {deleteConfirmId === item.id ? (
                      <span className="flex gap-1">
                        <button onClick={() => handleDelete(item.id)} className="text-xs text-red-600 hover:underline">削除する</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-400 hover:underline">キャンセル</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirmId(item.id)} className="text-xs text-gray-400 hover:text-red-500">削除</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 関連物件（検索時のみ表示） */}
        {query && relatedProjects.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-400 mb-2">「{query}」が含まれる物件</p>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {relatedProjects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                    <p className="text-xs text-gray-400 truncate">{p.location}{p.workType ? ` / ${p.workType}` : ""}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 追加・編集フォーム */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">{editingId ? "機種を編集" : "機種を追加"}</h3>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">既存型番 *</label>
                  <input required value={form.existingModel} onChange={(e) => setForm({ ...form, existingModel: e.target.value })} className={inputClass} placeholder="例: PAC-SH35KA" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">後継品型番 *</label>
                  <input required value={form.replacementModel} onChange={(e) => setForm({ ...form, replacementModel: e.target.value })} className={inputClass} placeholder="例: PAC-SH36KA" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">メーカー</label>
                    <input value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} className={inputClass} placeholder="例: 三菱電機" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">色</label>
                    <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className={inputClass} placeholder="例: ホワイト" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">金額（税別）</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
                      <input type="text" inputMode="numeric" value={form.price} onChange={(e) => numInput(e.target.value, "price")} className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">交換金額（税別）</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
                      <input type="text" inputMode="numeric" value={form.replacementCost} onChange={(e) => numInput(e.target.value, "replacementCost")} className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">更新日</label>
                  <input type="date" value={form.updatedOn} onChange={(e) => setForm({ ...form, updatedOn: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">関連部材型番</label>
                  <div className="flex gap-2 mb-2">
                    <input value={form.relatedPartsInput} onChange={(e) => setForm({ ...form, relatedPartsInput: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPart(); } }}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="型番を入力してEnter" />
                    <button type="button" onClick={addPart} className="text-xs bg-gray-100 text-gray-700 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-200 transition">追加</button>
                  </div>
                  {form.relatedParts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {form.relatedParts.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                          {p}
                          <button type="button" onClick={() => removePart(i)} className="text-gray-400 hover:text-red-500 leading-none">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputClass} placeholder="メモ・注意事項など" />
                </div>
                <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? "保存中..." : editingId ? "変更を保存" : "追加する"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
