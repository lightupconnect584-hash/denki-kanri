"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export default function Header() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const avatarUrl = (session?.user as { avatarUrl?: string })?.avatarUrl;
  const [menuOpen, setMenuOpen] = useState(false);

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

        {/* モバイル：アバター＋ハンバーガー */}
        <div className="flex sm:hidden items-center gap-3">
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
