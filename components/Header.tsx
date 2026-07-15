"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
// dmUnread はBottomNavで管理するため、Headerでのfetchは不要

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = (session?.user as { role?: string })?.role;
  const avatarUrl = (session?.user as { avatarUrl?: string })?.avatarUrl;
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"default" | "granted" | "denied">("default");

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
      <header className="bg-gray-950 border-b border-gray-800 px-3 py-2 flex items-center justify-between">
        {/* ロゴ */}
        <Link href="/dashboard" className="flex items-center shrink-0">
          <Image src="/logo.png" alt="logo" width={300} height={150} className="h-9 sm:h-12 w-auto" />
        </Link>

        {/* デスクトップナビ */}
        <div className="hidden sm:flex items-center gap-1.5">
          {(() => {
            const navLink = (href: string, label: string, active: boolean) => (
              <Link
                key={href}
                href={href}
                className={`text-sm rounded-lg px-3 py-1.5 transition font-medium ${
                  active ? "bg-gray-700 text-white" : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                {label}
              </Link>
            );
            return (
              <>
                {navLink("/dashboard", "依頼", pathname === "/dashboard" || (pathname.startsWith("/projects") && pathname !== "/projects/new"))}
                {navLink("/messages", "チャット", pathname === "/messages")}
                {navLink("/billing", "完了済", pathname === "/billing")}
                {role === "ADMIN" && navLink("/sales", "売上", pathname === "/sales")}
              </>
            );
          })()}
          <span className="w-px h-5 bg-gray-700 mx-1.5" />
          {notifStatus === "granted" ? (
            <span className="text-xs text-green-400 px-1" title="通知ON">🔔</span>
          ) : notifStatus === "denied" ? (
            <span className="text-xs text-gray-500 px-1" title="通知ブロック中（ブラウザ設定から変更）">🔕</span>
          ) : (
            <button onClick={subscribePush} className="text-xs text-yellow-400 border border-yellow-600 rounded px-2 py-1 hover:bg-yellow-900 transition">
              🔔 通知をON
            </button>
          )}
          <Link href="/settings" className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition ${pathname === "/settings" ? "bg-gray-700" : "hover:bg-gray-800"}`} title="設定">
            <Avatar />
            <span className="text-xs text-gray-300 max-w-[80px] truncate">{session?.user?.name}</span>
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs text-gray-400 hover:text-red-400 transition pl-1" title="ログアウト">
            ⏻
          </button>
        </div>

        {/* モバイル：ハンバーガーのみ */}
        <div className="flex sm:hidden items-center">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="text-gray-300 hover:text-white w-9 h-9 flex flex-col items-center justify-center gap-1.5"
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
          <Link href="/help" className="flex items-center gap-2 text-sm text-gray-200 hover:text-white py-2 border-b border-gray-700">
            <span>❓</span><span>使い方</span>
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
