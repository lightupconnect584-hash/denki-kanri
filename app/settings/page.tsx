"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  const currentAvatarUrl = (session?.user as { avatarUrl?: string })?.avatarUrl;
  const currentPhone = (session?.user as { phone?: string })?.phone || "";
  const role = (session?.user as { role?: string })?.role;

  // アバター
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 電話番号
  const [phoneInput, setPhoneInput] = useState(currentPhone);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // パスワード
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 画像選択（プレビューのみ・未保存）
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPreview(URL.createObjectURL(file));
    setPendingFile(file);
    setAvatarMessage(null);
  };

  const handleCancel = () => {
    setPendingFile(null);
    setPendingPreview(null);
    setAvatarMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 決定ボタン：圧縮→アップロード→DB保存→セッション更新
  const handleSaveAvatar = async () => {
    if (!pendingFile) return;
    setSavingAvatar(true);
    setAvatarMessage(null);
    try {
      // 正方形にトリミング＆圧縮
      const compressedFile = await new Promise<File>((resolve) => {
        const img = new window.Image();
        const url = URL.createObjectURL(pendingFile);
        img.onload = () => {
          const SIZE = 400;
          const min = Math.min(img.width, img.height);
          const scale = SIZE / min;
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = SIZE; canvas.height = SIZE;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, (w - SIZE) / -2, (h - SIZE) / -2, w, h);
          URL.revokeObjectURL(url);
          canvas.toBlob((blob) => {
            resolve(new File([blob!], "avatar.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.85);
        };
        img.src = url;
      });

      // アップロード
      const formData = new FormData();
      formData.append("file", compressedFile);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("アップロード失敗");
      const { filename } = await uploadRes.json();

      // DBに保存
      const saveRes = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: filename }),
      });
      if (!saveRes.ok) throw new Error("保存失敗");

      // セッションのJWTトークンを更新
      await update({ avatarUrl: filename });

      setPendingFile(null);
      setPendingPreview(null);
      setAvatarMessage({ type: "success", text: "プロフィール画像を保存しました" });
    } catch {
      setAvatarMessage({ type: "error", text: "アップロードに失敗しました" });
    }
    setSavingAvatar(false);
  };

  const handleRemoveAvatar = async () => {
    setSavingAvatar(true);
    await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: null }),
    });
    await update({ avatarUrl: null });
    setPendingFile(null);
    setPendingPreview(null);
    setAvatarMessage({ type: "success", text: "画像を削除しました" });
    setSavingAvatar(false);
  };

  const handleSavePhone = async () => {
    setSavingPhone(true);
    setPhoneMessage(null);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneInput }),
    });
    if (res.ok) {
      await update({ phone: phoneInput?.trim() || null });
      setPhoneMessage({ type: "success", text: "電話番号を保存しました" });
    } else {
      setPhoneMessage({ type: "error", text: "保存に失敗しました" });
    }
    setSavingPhone(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
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

  // 表示するアバター（未確定のプレビュー > 保存済み）
  const displayAvatar = pendingPreview
    ? pendingPreview
    : currentAvatarUrl
    ? (currentAvatarUrl.startsWith("http") ? currentAvatarUrl : `/uploads/${currentAvatarUrl}`)
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
          <h2 className="text-lg font-bold text-gray-800">設定</h2>
        </div>

        {/* プロフィール画像 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h3 className="text-sm font-bold text-gray-800 mb-4">👤 プロフィール画像</h3>

          <div className="flex flex-col items-center gap-4">
            {/* アバター */}
            <div className="relative">
              {displayAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayAvatar} alt="avatar"
                  className="w-24 h-24 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-3xl font-bold text-blue-600 border-2 border-gray-200">
                  {session?.user?.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              {pendingPreview && (
                <span className="absolute -top-1 -right-1 bg-yellow-400 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                  未保存
                </span>
              )}
            </div>

            <p className="text-sm font-medium text-gray-800">{session?.user?.name}</p>
            <p className="text-xs text-gray-500">{session?.user?.email}</p>

            {/* ボタン群 */}
            {!pendingPreview ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  disabled={savingAvatar}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                  画像を選択
                </button>
                {currentAvatarUrl && (
                  <button type="button" onClick={handleRemoveAvatar} disabled={savingAvatar}
                    className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
                    削除
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                <button type="button" onClick={handleSaveAvatar} disabled={savingAvatar}
                  className="flex-1 bg-blue-600 text-white text-sm py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {savingAvatar ? "保存中..." : "✓ 決定"}
                </button>
                <button type="button" onClick={handleCancel} disabled={savingAvatar}
                  className="flex-1 border border-gray-300 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
                  キャンセル
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

            {avatarMessage && (
              <p className={`text-xs ${avatarMessage.type === "success" ? "text-green-600" : "text-red-500"}`}>
                {avatarMessage.text}
              </p>
            )}
          </div>
        </div>

        {/* 管理者電話番号 */}
        {role === "ADMIN" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h3 className="text-sm font-bold text-gray-800 mb-4">📞 電話番号（協力会社に表示）</h3>
            <p className="text-xs text-gray-500 mb-3">
              設定すると協力会社が案件詳細画面からワンタップで電話できます
            </p>
            {phoneMessage && (
              <div className={`text-sm px-3 py-2 rounded-lg mb-3 ${
                phoneMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {phoneMessage.text}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="例: 090-1234-5678"
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleSavePhone}
                disabled={savingPhone}
                className="bg-blue-600 text-white text-sm px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
              >
                {savingPhone ? "保存中" : "保存"}
              </button>
            </div>
          </div>
        )}

        {/* パスワード変更 */}
        <form onSubmit={handlePasswordSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
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
