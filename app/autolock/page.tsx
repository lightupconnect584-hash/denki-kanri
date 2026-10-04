"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface Code {
  id: string;
  buildingName: string;
  address: string | null;
  code: string;
  note: string | null;
  updatedAt: string;
}

// オートロック解除番号の管理（管理者のみ）
// 登録しておくと、建物名（＋住所）が一致する案件の詳細に自動で表示される
export default function AutolockPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string })?.role;

  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ buildingName: "", address: "", code: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ buildingName: "", address: "", code: "", note: "" });

  const fetchCodes = () =>
    fetch("/api/autolock").then((r) => (r.ok ? r.json() : [])).then((d) => { setCodes(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") {
      if (role !== "ADMIN") { router.push("/dashboard"); return; }
      fetchCodes();
    }
  }, [status, role, router]);

  const add = async () => {
    if (!form.buildingName.trim() || !form.code.trim() || saving) return;
    setSaving(true);
    await fetch("/api/autolock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ buildingName: "", address: "", code: "", note: "" });
    await fetchCodes();
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editId || saving) return;
    setSaving(true);
    await fetch("/api/autolock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, ...editForm }),
    });
    setEditId(null);
    await fetchCodes();
    setSaving(false);
  };

  const remove = async (c: Code) => {
    if (!confirm(`「${c.buildingName}」の解除番号を削除しますか？`)) return;
    await fetch("/api/autolock", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    });
    fetchCodes();
  };

  const nq = q.trim().toLowerCase();
  const filtered = nq
    ? codes.filter((c) => [c.buildingName, c.address, c.code, c.note].filter(Boolean).join(" ").toLowerCase().includes(nq))
    : codes;

  const inputClass = "w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500";

  if (loading || status === "loading") {
    return <div className="min-h-full flex items-center justify-center bg-gray-900"><p className="text-gray-400">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
      <Header />
      <main className="flex-1 max-w-lg lg:max-w-2xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white">🔑 オートロック解除番号</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">登録すると、建物名（＋住所）が一致する案件の詳細に自動で表示されます（協力会社にも表示）。</p>

        {/* 追加フォーム */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.buildingName} onChange={(e) => setForm({ ...form, buildingName: e.target.value })} className={inputClass} placeholder="建物名 *" />
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} placeholder="解除番号 *（例: #1234）" />
          </div>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} placeholder="住所（同名建物がある場合の判別用・任意）" />
          <div className="flex gap-2">
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} placeholder="メモ（例: 夜間は通用口から）" />
            <button onClick={add} disabled={!form.buildingName.trim() || !form.code.trim() || saving}
              className="shrink-0 bg-blue-600 text-white text-sm rounded-lg px-4 hover:bg-blue-700 disabled:opacity-50 transition">追加</button>
          </div>
        </div>

        {/* 検索 */}
        <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inputClass} mb-3`} placeholder="🔍 建物名・住所で検索" />

        {/* 一覧 */}
        {filtered.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-10">登録がありません</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <div key={c.id} className="bg-gray-800 rounded-xl border border-gray-700 p-3">
                {editId === c.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editForm.buildingName} onChange={(e) => setEditForm({ ...editForm, buildingName: e.target.value })} className={inputClass} placeholder="建物名" />
                      <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} className={inputClass} placeholder="解除番号" />
                    </div>
                    <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className={inputClass} placeholder="住所" />
                    <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} className={inputClass} placeholder="メモ" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditId(null)} className="text-xs text-gray-400 px-3 py-1.5 hover:text-gray-200">キャンセル</button>
                      <button onClick={saveEdit} disabled={saving} className="text-xs bg-blue-600 text-white rounded-lg px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition">保存</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-100 truncate">{c.buildingName}</p>
                      {c.address && <p className="text-xs text-gray-500 truncate">📍 {c.address}</p>}
                      {c.note && <p className="text-xs text-gray-400 truncate">{c.note}</p>}
                    </div>
                    <p className="text-base font-bold text-amber-300 shrink-0 tracking-wider">{c.code}</p>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => { setEditId(c.id); setEditForm({ buildingName: c.buildingName, address: c.address || "", code: c.code, note: c.note || "" }); }}
                        className="text-xs text-blue-400 border border-blue-800 rounded px-2 py-0.5 hover:bg-blue-900/40 transition">編集</button>
                      <button onClick={() => remove(c)} className="text-xs text-gray-500 border border-gray-700 rounded px-2 py-0.5 hover:text-red-400 hover:border-red-800 transition">削除</button>
                    </div>
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
