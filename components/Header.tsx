"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useCallback } from "react";

export default function Header() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const avatarUrl = (session?.user as { avatarUrl?: string })?.avatarUrl;
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"default" | "granted" | "denied">("default");
  const [dmUnread, setDmUnread] = useState(0);

  const fetchDmUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) return;
      const threads: { unreadCount: number }[] = await res.json();
      setDmUnread(threads.reduce((sum, t) => sum + t.unreadCount, 0));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchDmUnread();
      const id = setInterval(fetchDmUnread, 30000); // 30秒ごとにポーリング
      return () => clearInterval(id);
    }
  }, [session?.user, fetchDmUnread]);

  // アプリを開いたことを記録（5分に1回）
  useEffect(() => {
    if (session?.user) {
      fetch("/api/ping", { method: "POST" }).catch(() => {});
    }
  }, [session?.user]);

  // 通知の現在の許可状態を確認
  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifStatus(Notification.permission as "default" | "granted" | "denied");
    }
  }, []);

  // base64 → Uint8Array変換（applicationServerKeyに必要）
  const urlBase64ToUint8Array = (base64: string) => {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
  };

  const subscribePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("このブラウザはプッシュ通知に対応していません\n\niPhoneの場合はSafariで「ホーム画面に追加」してから開いてください");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      setNotifStatus(permission as "default" | "granted" | "denied");
      if (permission !== "granted") {
        alert("通知が許可されませんでした。\nブラウザの設定から通知を許可してください。");
        return;
      }

      const res = await fetch("/api/push");
      const { publicKey } = await res.json();

      // 既存の購読があれば解除して再登録
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON();
      const saveRes = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });

      if (saveRes.ok) {
        // テスト通知を送信
        await fetch("/api/push/test", { method: "POST" });
      }
    } catch (e) {
      console.error("Push subscription error:", e);
      alert(`通知の設定に失敗しました: ${String(e)}`);
    }
  };

  const Avatar = () => avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl.startsWith("http") ? avatarUrl : `/uploads/${avatarUrl}`}
      alt="avatar"
      className="w-7 h-7 rounded-full object-cover border border-gray-600 shrink-0"
    />
  ) : (
    <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white border border-gray-600 shrink-0">
      {session?.user?.name?.[0]?.toUpperCase() || "?"}
    </div>
  );

  return (
    <>
      <header className="bg-gray-900 border-b border-gray-700 px-3 py-2 flex items-center justify-between">
        {/* ロゴ */}
        <Link href="/dashboard" className="flex items-center shrink-0">
          <Image src="/logo.png" alt="logo" width={300} height={150} className="h-9 sm:h-12 w-auto" />
        </Link>

        {/* デスクトップナビ */}
        <div className="hidden sm:flex items-center gap-2">
          {notifStatus === "granted" ? (
            <span className="text-xs text-green-400 border border-green-700 rounded px-2 py-1">🔔 通知ON</span>
          ) : notifStatus === "denied" ? (
            <span className="text-xs text-gray-500 border border-gray-700 rounded px-2 py-1" title="ブラウザの設定から通知を許可してください">🔕 通知ブロック中</span>
          ) : (
            <button onClick={subscribePush} className="text-xs text-yellow-400 border border-yellow-600 rounded px-2 py-1 hover:bg-yellow-900 transition animate-pulse">
              🔔 通知をON
            </button>
          )}
          <Link href="/messages" className="relative text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1">
            💬 メッセージ
            {dmUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                {dmUnread > 9 ? "9+" : dmUnread}
              </span>
            )}
          </Link>
          {role === "ADMIN" && (
            <Link href="/estimate" className="text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1">見積り</Link>
          )}
          <Link href="/billing" className="text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1">完了済依頼</Link>
          <Link href="/replacement-models" className="text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1">交換機種表</Link>
          <Link href="/help" className="text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1">使い方</Link>
          <Link href="/settings" className="flex items-center gap-1.5 hover:opacity-80 transition ml-1">
            <Avatar />
            <span className="text-xs text-gray-300 max-w-[80px] truncate">{session?.user?.name}</span>
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs text-gray-400 hover:text-red-400 transition pl-1">
            ログアウト
          </button>
        </div>

        {/* モバイル：メッセージ常時表示＋アバター＋ハンバーガー */}
        <div className="flex sm:hidden items-center gap-2">
          <Link href="/messages" className="relative w-9 h-9 flex items-center justify-center text-gray-300 hover:text-white rounded-lg hover:bg-gray-800 transition">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
            </svg>
            {dmUnread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {dmUnread > 9 ? "9+" : dmUnread}
              </span>
            )}
          </Link>
          <Link href="/settings" className="hover:opacity-80 transition">
            <Avatar />
          </Link>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="text-gray-300 hover:text-white w-8 h-8 flex flex-col items-center justify-center gap-1.5"
            aria-label="メニュー"
          >
            <span className={`block w-5 h-0.5 bg-current transition-transform origin-center ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-5 h-0.5 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-current transition-transform origin-center ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </header>

      {/* モバイルドロワー */}
      {menuOpen && (
        <div className="sm:hidden bg-gray-800 border-b border-gray-700 px-4 py-3 space-y-1" onClick={() => setMenuOpen(false)}>
          {notifStatus === "granted" ? (
            <div className="flex items-center gap-2 text-sm text-green-400 py-2 border-b border-gray-700">
              <span>🔔</span><span>通知ON済み</span>
            </div>
          ) : notifStatus === "denied" ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2 border-b border-gray-700">
              <span>🔕</span><span>通知ブロック中（設定から変更）</span>
            </div>
          ) : (
            <button onClick={subscribePush} className="flex items-center gap-2 text-sm text-yellow-400 py-2 border-b border-gray-700 w-full">
              <span>🔔</span><span>通知をONにする</span>
            </button>
          )}
          {role === "ADMIN" && (
            <Link href="/estimate" className="flex items-center gap-2 text-sm text-gray-200 hover:text-white py-2 border-b border-gray-700">
              <span>📋</span><span>見積り</span>
            </Link>
          )}
          <Link href="/billing" className="flex items-center gap-2 text-sm text-gray-200 hover:text-white py-2 border-b border-gray-700">
            <span>💰</span><span>完了済依頼</span>
          </Link>
          <Link href="/replacement-models" className="flex items-center gap-2 text-sm text-gray-200 hover:text-white py-2 border-b border-gray-700">
            <span>🔌</span><span>交換機種表</span>
          </Link>
          <Link href="/help" className="flex items-center gap-2 text-sm text-gray-200 hover:text-white py-2 border-b border-gray-700">
            <span>❓</span><span>使い方</span>
          </Link>
          <Link href="/settings" className="flex items-center gap-2 text-sm text-gray-200 hover:text-white py-2 border-b border-gray-700">
            <span>⚙️</span><span>設定</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 py-2 w-full"
          >
            <span>⏻</span><span>ログアウト</span>
          </button>
        </div>
      )}
    </>
  );
}
