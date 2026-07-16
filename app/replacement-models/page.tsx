"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { enhanceForOcr } from "@/lib/enhanceForOcr";

interface UserMini {
  id: string;
  name: string;
  companyName: string | null;
  avatarUrl: string | null;
}

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
  updatedOn: string | null;
  createdAt: string;
  updatedAt: string;
  category: Category | null;
  createdBy: UserMini | null;
  updatedBy: UserMini | null;
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
  categoryId: "",
};

function Avatar({ user, size = 6 }: { user: UserMini | null; size?: number }) {
  if (!user) return null;
  const sizeClass = `w-${size} h-${size}`;
  const label = user.companyName || user.name;
  if (user.avatarUrl) {
    const src = user.avatarUrl.startsWith("http") ? user.avatarUrl : `/uploads/${user.avatarUrl}`;
    return (
      <img src={src} alt={label} title={label}
        className={`${sizeClass} rounded-full object-cover border border-gray-700 shrink-0`} />
    );
  }
  return (
    <div title={label}
      className={`${sizeClass} rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shrink-0`}
      style={{ fontSize: size * 2 }}>
      {label[0]?.toUpperCase()}
    </div>
  );
}

export default function ReplacementModelsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "ADMIN";

  const [items, setItems] = useState<ReplacementModel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedProjects, setRelatedProjects] = useState<RelatedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // カテゴリ開閉
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const toggleCat = (id: string) => setOpenCats(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  // モデル追加・編集フォーム
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false); // 詳細（任意）欄の開閉
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [formDrag, setFormDrag] = useState(false);

  // カテゴリ管理
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [deleteCatConfirmId, setDeleteCatConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchAll = useCallback(async (q: string) => {
    setLoading(true);
    const [modelsRes, catsRes] = await Promise.all([
      fetch(`/api/replacement-models?q=${encodeURIComponent(q)}`),
      fetch("/api/replacement-categories"),
    ]);
    const modelsData = await modelsRes.json();
    const catsData = await catsRes.json();
    setItems(modelsData.items || []);
    setRelatedProjects(modelsData.relatedProjects || []);
    setCategories(catsData || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchAll("");
  }, [status, fetchAll]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAll(query);
  };

  const openNew = (defaultCategoryId?: string) => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setForm({ ...emptyForm, categoryId: defaultCategoryId || "", updatedOn: iso });
    setEditingId(null);
    setShowDetails(false);
    setExtractError(null);
    setShowForm(true);
  };

  // 📷 写真・PDFから自動入力
  const runExtract = useCallback(async (file: File) => {
    setExtracting(true);
    setExtractError(null);
    try {
      const aiFile = file.type.startsWith("image/") ? await enhanceForOcr(file) : file;
      const fd = new FormData();
      fd.append("file", aiFile);
      const res = await fetch("/api/replacement-models/extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "読み取りに失敗しました");
      const d = json.data as { existingModel?: string; replacementModel?: string; maker?: string; color?: string; relatedParts?: string[]; notes?: string };
      setForm((prev) => ({
        ...prev,
        existingModel: d.existingModel || prev.existingModel,
        replacementModel: d.replacementModel || prev.replacementModel,
        maker: d.maker || prev.maker,
        color: d.color || prev.color,
        relatedParts: d.relatedParts && d.relatedParts.length > 0 ? d.relatedParts : prev.relatedParts,
        notes: d.notes || prev.notes,
      }));
      if (d.maker || d.color || (d.relatedParts && d.relatedParts.length > 0) || d.notes) setShowDetails(true);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "読み取りに失敗しました");
    }
    setExtracting(false);
  }, []);

  const extractFromFiles = useCallback((files: File[]) => {
    const f = files.find((x) => x.type === "application/pdf" || x.type.startsWith("image/") || x.name.toLowerCase().endsWith(".pdf"));
    if (f) runExtract(f);
  }, [runExtract]);

  // フォームを開いている間、貼り付けで読み取り
  useEffect(() => {
    if (!showForm) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === "file" && (it.type === "application/pdf" || it.type.startsWith("image/"))) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) { e.preventDefault(); extractFromFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [showForm, extractFromFiles]);

  const openEdit = (item: ReplacementModel) => {
    setShowDetails(true);
    setExtractError(null);
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
      categoryId: item.category?.id || "",
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
      categoryId: form.categoryId || null,
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

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    const res = await fetch("/api/replacement-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim() }),
    });
    if (res.ok) {
      const cat = await res.json();
      setCategories(prev => [...prev, cat]);
      setNewCatName("");
    }
    setSavingCat(false);
  };

  const saveCategory = async (id: string) => {
    const res = await fetch("/api/replacement-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editingCatName }),
    });
    if (res.ok) {
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name: editingCatName } : c));
      setEditingCatId(null);
    }
  };

  const deleteCategory = async (id: string) => {
    await fetch(`/api/replacement-categories?id=${id}`, { method: "DELETE" });
    setCategories(prev => prev.filter(c => c.id !== id));
    setItems(prev => prev.map(item => item.category?.id === id ? { ...item, category: null } : item));
    setDeleteCatConfirmId(null);
  };

  const numInput = (val: string, field: "price" | "replacementCost") => {
    const v = val.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");
    setForm({ ...form, [field]: v });
  };

  const inputClass = "w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

  // カテゴリ別にグループ化
  const grouped = (() => {
    const map = new Map<string, { cat: Category | null; items: ReplacementModel[] }>();
    // カテゴリ順で初期化
    categories.forEach(c => map.set(c.id, { cat: c, items: [] }));
    map.set("__none__", { cat: null, items: [] });
    items.forEach(item => {
      const key = item.category?.id || "__none__";
      if (!map.has(key)) map.set(key, { cat: item.category, items: [] });
      map.get(key)!.items.push(item);
    });
    // 各カテゴリ内を五十音順にソート
    map.forEach(v => {
      v.items.sort((a, b) => a.existingModel.localeCompare(b.existingModel, "ja"));
    });
    // カテゴリなしが空なら除外
    const result = Array.from(map.entries()).filter(([k, v]) => k !== "__none__" || v.items.length > 0);
    return result;
  })();

  const isSearching = query.trim() !== "";

  if (status === "loading" || loading) {
    return <div className="min-h-full flex items-center justify-center bg-gray-900"><p className="text-gray-400">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
      <Header />
      <main className="flex-1 max-w-2xl lg:max-w-4xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white flex-1">交換機種表</h2>
          <div className="flex gap-2">
            {role === "ADMIN" && (
              <button onClick={() => setShowCatManager(true)}
                className="text-xs bg-gray-800 text-gray-200 border border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-700 transition">
                大枠管理
              </button>
            )}
            <button onClick={() => openNew()}
              className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition">
              ＋ 追加
            </button>
          </div>
        </div>

        {/* 注意書き */}
        <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5 mb-4 text-xs text-yellow-800">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <p>掲載情報は参考値です。型番の誤りや生産終了の可能性がありますので、必ず最新情報をご確認ください。</p>
        </div>

        {/* 検索 */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-5">
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="型番・メーカーで検索"
            className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit" className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 transition">検索</button>
          {query && (
            <button type="button" onClick={() => { setQuery(""); fetchAll(""); }}
              className="text-gray-400 hover:text-white text-sm px-2">✕</button>
          )}
        </form>

        {/* カテゴリ別一覧（検索中は全展開） */}
        {grouped.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-3">🔌</p>
            <p>{isSearching ? "該当する機種が見つかりませんでした" : "まだ登録がありません"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([key, { cat, items: catItems }]) => {
              const isOpen = isSearching || openCats.has(key);
              return (
                <div key={key} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  {/* カテゴリヘッダー */}
                  <button
                    onClick={() => toggleCat(key)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-100">
                        {cat ? cat.name : "未分類"}
                      </span>
                      <span className="text-xs text-gray-400">{catItems.length}件</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openNew(cat?.id); }}
                        className="text-xs text-blue-600 hover:underline px-1"
                      >＋</button>
                      <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* モデル一覧 */}
                  {isOpen && (
                    <div className="border-t border-gray-700 divide-y divide-gray-700">
                      {catItems.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">この大枠にはまだ登録がありません</p>
                      ) : catItems.map((item) => (
                        <ModelCard
                          key={item.id}
                          item={item}
                          onEdit={openEdit}
                          onDelete={(id) => setDeleteConfirmId(id)}
                          deleteConfirmId={deleteConfirmId}
                          onDeleteConfirm={handleDelete}
                          onDeleteCancel={() => setDeleteConfirmId(null)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 関連物件（検索時のみ） */}
        {isSearching && relatedProjects.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">「{query}」が含まれる物件</p>
            <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
              {relatedProjects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-gray-700 transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">{p.title}</p>
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
            <div
              className={`bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 shadow-xl border-2 transition ${formDrag ? "border-dashed border-blue-400" : "border-transparent"}`}
              onDragOver={(e) => { e.preventDefault(); setFormDrag(true); }}
              onDragLeave={() => setFormDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setFormDrag(false);
                const dt = e.dataTransfer;
                const files: File[] = dt.files && dt.files.length > 0
                  ? Array.from(dt.files)
                  : Array.from(dt.items || []).filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter((f): f is File => !!f);
                if (files.length > 0) extractFromFiles(files);
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-100">{editingId ? "機種を編集" : "機種を追加"}</h3>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-300 text-xl leading-none">✕</button>
              </div>
              {/* 📷 AI自動入力 */}
              <div className="mb-4 bg-blue-950/40 border border-blue-800 rounded-xl px-3 py-2.5 flex items-center gap-2">
                <span className="text-base shrink-0">📷</span>
                <p className="text-xs text-blue-300 flex-1 min-w-0">
                  {extracting ? "AIが読み取り中…" : "後継品案内・銘板の写真やPDFから自動入力（撮影／ドロップ／貼り付け）"}
                </p>
                <label className={`shrink-0 text-xs rounded-lg px-3 py-1.5 cursor-pointer transition ${extracting ? "bg-gray-700 text-gray-400" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                  {extracting ? "読み取り中…" : "ファイル選択"}
                  <input type="file" accept="application/pdf,image/*" capture="environment" className="hidden" disabled={extracting}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) runExtract(f); e.target.value = ""; }} />
                </label>
              </div>
              {extractError && <p className="text-xs text-red-400 mb-3">⚠️ {extractError}</p>}
              <form onSubmit={handleSave} className="space-y-3" onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">大枠（カテゴリ）</label>
                  <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className={inputClass}>
                    <option value="">未分類</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">既存型番 *</label>
                  <input required value={form.existingModel}
                    onChange={(e) => setForm({ ...form, existingModel: e.target.value })}
                    className={inputClass} placeholder="例: PAC-SH35KA" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">後継品型番 *</label>
                  <input required value={form.replacementModel}
                    onChange={(e) => setForm({ ...form, replacementModel: e.target.value })}
                    className={inputClass} placeholder="例: PAC-SH36KA" />
                </div>
                <button type="button" onClick={() => setShowDetails((v) => !v)}
                  className="w-full flex items-center justify-between text-xs text-gray-400 border border-gray-700 rounded-lg px-3 py-2 hover:border-gray-500 transition">
                  <span>詳細を入力（メーカー・色・金額・部材など / 任意）</span>
                  <span>{showDetails ? "▲" : "▼"}</span>
                </button>
                {showDetails && (<>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">メーカー</label>
                    <input value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })}
                      className={inputClass} placeholder="例: 三菱電機" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">色</label>
                    <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className={inputClass} placeholder="例: ホワイト" />
                  </div>
                </div>
                {/* 金額は管理者のみ入力可（見積りツール用。一覧には表示しない） */}
                {isAdmin && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">金額（税別）<span className="ml-1 text-gray-500 font-normal">※見積りツール用</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
                        <input type="text" inputMode="numeric" value={form.price}
                          onChange={(e) => numInput(e.target.value, "price")}
                          className="w-full border border-gray-600 rounded-lg pl-6 pr-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="0" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">工賃（税別）<span className="ml-1 text-gray-500 font-normal">※見積りツール用</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
                        <input type="text" inputMode="numeric" value={form.replacementCost}
                          onChange={(e) => numInput(e.target.value, "replacementCost")}
                          className="w-full border border-gray-600 rounded-lg pl-6 pr-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="0" />
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">更新日</label>
                  <input type="date" value={form.updatedOn}
                    onChange={(e) => setForm({ ...form, updatedOn: e.target.value })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">関連部材型番</label>
                  <div className="flex gap-2 mb-2">
                    <input value={form.relatedPartsInput}
                      onChange={(e) => setForm({ ...form, relatedPartsInput: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addPart(); } }}
                      className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="型番を入力してEnter" />
                    <button type="button" onClick={addPart}
                      className="text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-600 transition">追加</button>
                  </div>
                  {form.relatedParts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {form.relatedParts.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded-full">
                          {p}
                          <button type="button" onClick={() => removePart(i)}
                            className="text-gray-400 hover:text-red-500 leading-none">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">備考</label>
                  <textarea value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2} className={inputClass} placeholder="メモ・注意事項など" />
                </div>
                </>)}
                <button type="submit" disabled={saving}
                  className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? "保存中..." : editingId ? "変更を保存" : "追加する"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* カテゴリ管理モーダル（管理者のみ） */}
        {showCatManager && role === "ADMIN" && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
            <div className="bg-gray-800 rounded-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-100">大枠の管理</h3>
                <button onClick={() => setShowCatManager(false)} className="text-gray-400 hover:text-gray-300 text-xl">✕</button>
              </div>
              <div className="flex gap-2 mb-4">
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addCategory(); } }}
                  placeholder="大枠名を入力"
                  className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={addCategory} disabled={savingCat || !newCatName.trim()}
                  className="bg-blue-600 text-white text-sm px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">追加</button>
              </div>
              <div className="space-y-2">
                {categories.length === 0 && <p className="text-xs text-gray-400 text-center py-4">まだ大枠がありません</p>}
                {categories.map(c => (
                  <div key={c.id} className="flex items-center gap-2 bg-gray-700/50 rounded-lg px-3 py-2">
                    {editingCatId === c.id ? (
                      <>
                        <input value={editingCatName} onChange={(e) => setEditingCatName(e.target.value)}
                          className="flex-1 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={() => saveCategory(c.id)} className="text-xs text-blue-600 hover:underline">保存</button>
                        <button onClick={() => setEditingCatId(null)} className="text-xs text-gray-400 hover:underline">戻る</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-gray-100">{c.name}</span>
                        <button onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name); }}
                          className="text-xs text-blue-600 hover:underline">編集</button>
                        {deleteCatConfirmId === c.id ? (
                          <>
                            <button onClick={() => deleteCategory(c.id)} className="text-xs text-red-600 hover:underline">削除する</button>
                            <button onClick={() => setDeleteCatConfirmId(null)} className="text-xs text-gray-400 hover:underline">戻る</button>
                          </>
                        ) : (
                          <button onClick={() => setDeleteCatConfirmId(c.id)} className="text-xs text-gray-400 hover:text-red-500">削除</button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ModelCard({
  item, onEdit, onDelete, deleteConfirmId, onDeleteConfirm, onDeleteCancel,
}: {
  item: ReplacementModel;
  onEdit: (item: ReplacementModel) => void;
  onDelete: (id: string) => void;
  deleteConfirmId: string | null;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = async (e: React.MouseEvent, text: string, key: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="px-4 py-3">
      {/* タッチで展開 */}
      <button className="w-full text-left" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-xs text-gray-400">既存</span>
              <span className="text-sm font-bold text-gray-100">{item.existingModel}</span>
              <button type="button" onClick={(e) => copyText(e, item.existingModel, "existing")}
                className="text-xs text-gray-400 hover:text-gray-200 px-1">
                {copied === "existing" ? "✓" : "📋"}
              </button>
              <span className="text-gray-400 text-xs">→</span>
              <span className="text-xs text-gray-400">後継</span>
              <span className="text-sm font-bold text-blue-400">{item.replacementModel}</span>
              <button type="button" onClick={(e) => copyText(e, item.replacementModel, "replacement")}
                className="text-xs text-gray-400 hover:text-gray-200 px-1">
                {copied === "replacement" ? "✓" : "📋"}
              </button>
            </div>
            {(item.maker || item.color) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {[item.maker, item.color].filter(Boolean).join(" / ")}
              </p>
            )}
          </div>
          {/* 登録者・更新者アバター */}
          <div className="flex -space-x-1 shrink-0">
            {item.createdBy && (
              <div title={`登録: ${item.createdBy.companyName || item.createdBy.name}`}>
                <UserAvatar user={item.createdBy} />
              </div>
            )}
            {item.updatedBy && item.updatedBy.id !== item.createdBy?.id && (
              <div title={`更新: ${item.updatedBy.companyName || item.updatedBy.name}`}>
                <UserAvatar user={item.updatedBy} />
              </div>
            )}
          </div>
          <span className="text-gray-400 text-xs ml-1">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* 展開時の詳細 */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-gray-700 pt-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {item.updatedOn && (
              <div><span className="text-gray-400">更新日</span><span className="ml-1 text-gray-200">{new Date(item.updatedOn).toLocaleDateString("ja-JP")}</span></div>
            )}
          </div>
          {item.relatedParts.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">関連部材</p>
              <div className="flex flex-wrap gap-1">
                {item.relatedParts.map((p, i) => (
                  <span key={i} className="inline-block bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}
          {item.notes && <p className="text-xs text-gray-400">{item.notes}</p>}

          {/* 登録者・更新者情報 */}
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-400">
            {item.createdBy && (
              <span>登録: {item.createdBy.companyName || item.createdBy.name}</span>
            )}
            {item.updatedBy && item.updatedBy.id !== item.createdBy?.id && (
              <span>更新: {item.updatedBy.companyName || item.updatedBy.name}</span>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => onEdit(item)} className="text-xs text-blue-600 hover:underline">編集</button>
            {deleteConfirmId === item.id ? (
              <>
                <button onClick={() => onDeleteConfirm(item.id)} className="text-xs text-red-600 hover:underline">削除する</button>
                <button onClick={onDeleteCancel} className="text-xs text-gray-400 hover:underline">キャンセル</button>
              </>
            ) : (
              <button onClick={() => onDelete(item.id)} className="text-xs text-gray-400 hover:text-red-500">削除</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserAvatar({ user }: { user: UserMini }) {
  const label = user.companyName || user.name;
  if (user.avatarUrl) {
    const src = user.avatarUrl.startsWith("http") ? user.avatarUrl : `/uploads/${user.avatarUrl}`;
    return <img src={src} alt={label} className="w-6 h-6 rounded-full object-cover border-2 border-white" />;
  }
  return (
    <div className="w-6 h-6 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center"
      style={{ fontSize: 10 }}>
      <span className="text-white font-bold">{label[0]?.toUpperCase()}</span>
    </div>
  );
}
