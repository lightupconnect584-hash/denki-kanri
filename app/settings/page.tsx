"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ type: "error", text: "新しいパスワードが一致しません" });
      return;
    }
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ type: "success", text: "パスワードを変更しました" });
      setCurrent(""); setNext(""); setConfirm("");
    } else {
      setMessage({ type: "error", text: data.error || "エラーが発生しました" });
    }
    setLoading(false);
  };

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
          <h2 className="text-lg font-bold text-gray-800">設定</h2>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <p className="text-xs text-gray-500 mb-1">ログイン中のユーザー</p>
          <p className="text-sm font-medium text-gray-800">{session?.user?.name}</p>
          <p className="text-xs text-gray-500 mt-1">{session?.user?.email}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">🔑 パスワード変更</h3>

          {message && (
            <div className={`text-sm px-3 py-2 rounded-lg ${
              message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {message.text}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">現在のパスワード</label>
            <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（6文字以上）</label>
            <input type="password" required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（確認）</label>
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? "変更中..." : "パスワードを変更する"}
          </button>
        </form>
      </main>
    </div>
  );
}
