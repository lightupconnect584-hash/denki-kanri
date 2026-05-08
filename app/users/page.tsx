"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface User {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  role: string;
  avatarUrl: string | null;
  color: string | null;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#84cc16", "#6b7280",
];

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newRole, setNewRole] = useState<"PARTNER" | "ADMIN">("PARTNER");
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });
  const [loading, setLoading] = useState(false);

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [savingColor, setSavingColor] = useState(false);

  const role = (session?.user as { role?: string })?.role;
  const myId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  const fetchUsers = () => {
    fetch("/api/users").then((r) => r.json()).then(setUsers);
  };

  useEffect(() => {
    if (status === "authenticated") fetchUsers();
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role: newRole }),
    });
    setForm({ name: "", email: "", password: "", companyName: "" });
    setShowForm(false);
    fetchUsers();
    setLoading(false);
  };

  const handleResetPassword = async (userId: string) => {
    if (!resetPassword.trim()) return;
    setResetLoading(true);
    setResetError("");
    const res = await fetch(`/api/users?id=${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    if (res.ok) {
      setResetUserId(null);
      setResetPassword("");
    } else {
      const data = await res.json();
      setResetError(data.error || "エラーが発生しました");
    }
    setResetLoading(false);
  };

  const handleDelete = async (userId: string) => {
    setDeleteLoading(true);
    setDeleteError((prev) => ({ ...prev, [userId]: "" }));
    try {
      const res = await fetch(`/api/users?id=${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setConfirmDeleteId(null);
        fetchUsers();
      } else {
        setDeleteError((prev) => ({ ...prev, [userId]: data.error || "削除できませんでした" }));
      }
    } catch {
      setDeleteError((prev) => ({ ...prev, [userId]: "通信エラーが発生しました" }));
    }
    setDeleteLoading(false);
  };

  const handleColorSelect = async (userId: string, color: string | null) => {
    setSavingColor(true);
    await fetch(`/api/users?id=${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    await fetchUsers();
    setSavingColor(false);
    setColorPickerId(null);
  };

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const admins = users.filter((u) => u.role === "ADMIN");
  const partners = users.filter((u) => u.role === "PARTNER");

  const renderUserCard = (u: User) => (
    <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* カラードット（協力会社のみ） */}
          {u.role === "PARTNER" && (
            <div
              className="w-3 h-3 rounded-full shrink-0 mt-0.5"
              style={{ backgroundColor: u.color || "#d1d5db" }}
            />
          )}
          {u.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatarUrl.startsWith("http") ? u.avatarUrl : `/uploads/${u.avatarUrl}`}
              alt={u.name}
              className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white border border-gray-200 shrink-0"
              style={{ backgroundColor: u.role === "PARTNER" ? (u.color || "#9ca3af") : "#2563eb" }}
            >
              {(u.companyName || u.name)[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-800 text-sm">{u.companyName || u.name}</p>
              {u.id === myId && (
                <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">自分</span>
              )}
            </div>
            {u.companyName && <p className="text-xs text-gray-500">{u.name}</p>}
            <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {u.role === "PARTNER" && (
            <button
              onClick={() => setColorPickerId(colorPickerId === u.id ? null : u.id)}
              className="text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 transition flex items-center gap-1"
            >
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: u.color || "#d1d5db" }} />
              カラー
            </button>
          )}
          <button
            onClick={() => {
              setResetUserId(resetUserId === u.id ? null : u.id);
              setResetPassword("");
              setResetError("");
            }}
            className="text-xs text-blue-500 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50 transition"
          >
            PW変更
          </button>
          {u.id !== myId && u.role !== "ADMIN" && (
            <button
              onClick={() => setConfirmDeleteId(confirmDeleteId === u.id ? null : u.id)}
              className="text-xs text-red-400 border border-red-300 rounded px-2 py-1 hover:bg-red-50 transition"
            >
              削除
            </button>
          )}
        </div>
      </div>

      {/* カラーピッカー */}
      {colorPickerId === u.id && (
        <div className="border border-gray-200 bg-gray-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-gray-600">カレンダー表示カラーを選択</p>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => handleColorSelect(u.id, c)}
                disabled={savingColor}
                className="w-8 h-8 rounded-full border-2 transition hover:scale-110 disabled:opacity-50"
                style={{
                  backgroundColor: c,
                  borderColor: u.color === c ? "#1e40af" : "transparent",
                  outline: u.color === c ? "2px solid #93c5fd" : "none",
                }}
              />
            ))}
            {u.color && (
              <button
                onClick={() => handleColorSelect(u.id, null)}
                disabled={savingColor}
                className="w-8 h-8 rounded-full border-2 border-gray-300 bg-white text-gray-400 text-xs hover:bg-gray-100 transition disabled:opacity-50"
                title="カラーをリセット"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* 削除確認 */}
      {confirmDeleteId === u.id && (
        <div className="border border-red-200 bg-red-50 rounded-lg px-3 py-3 space-y-2">
          <p className="text-xs font-medium text-red-700">「{u.companyName || u.name}」を削除しますか？</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleDelete(u.id)}
              disabled={deleteLoading}
              className="flex-1 bg-red-500 text-white text-xs rounded-lg py-2 font-medium hover:bg-red-600 disabled:opacity-50 transition"
            >
              {deleteLoading ? "削除中..." : "削除する"}
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="flex-1 border border-gray-300 text-gray-600 text-xs rounded-lg py-2 hover:bg-gray-50 transition"
            >
              キャンセル
            </button>
          </div>
          {deleteError[u.id] && (
            <p className="text-xs text-red-600 font-medium">{deleteError[u.id]}</p>
          )}
        </div>
      )}

      {/* PW変更フォーム */}
      {resetUserId === u.id && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-600">新しいパスワードを設定</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="新しいパスワード（4文字以上）"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleResetPassword(u.id)}
              disabled={resetLoading || !resetPassword.trim()}
              className="bg-blue-600 text-white text-xs px-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
            >
              {resetLoading ? "保存中" : "保存"}
            </button>
            <button
              onClick={() => { setResetUserId(null); setResetPassword(""); }}
              className="text-gray-400 text-xs px-2 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          {resetError && <p className="text-xs text-red-500">{resetError}</p>}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">ユーザー管理</h2>
          <button
            onClick={() => { setShowForm(!showForm); setNewRole("PARTNER"); }}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            ＋ 追加
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-3">
            <h3 className="text-sm font-bold text-gray-700">新しいユーザーを追加</h3>
            <div className="flex gap-2">
              {(["PARTNER", "ADMIN"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setNewRole(r)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    newRole === r ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                  }`}>
                  {r === "ADMIN" ? "管理者" : "協力会社"}
                </button>
              ))}
            </div>
            {newRole === "PARTNER" && (
              <input type="text" placeholder="会社名" value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={inputClass} />
            )}
            <input type="text" required placeholder="名前" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input type="email" required placeholder="メールアドレス" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            <input type="password" required placeholder="初期パスワード" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <button type="submit" disabled={loading}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                {loading ? "追加中..." : "追加する"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition">
                キャンセル
              </button>
            </div>
          </form>
        )}

        <div className="mb-6">
          <p className="text-xs font-bold text-gray-500 mb-2 px-1">👑 管理者 ({admins.length})</p>
          <div className="space-y-3">{admins.map(renderUserCard)}</div>
        </div>

        <div>
          <p className="text-xs font-bold text-gray-500 mb-2 px-1">🏢 協力会社 ({partners.length})</p>
          <div className="space-y-3">
            {partners.map(renderUserCard)}
            {partners.length === 0 && (
              <p className="text-center text-gray-400 py-6 text-sm">協力会社が登録されていません</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
