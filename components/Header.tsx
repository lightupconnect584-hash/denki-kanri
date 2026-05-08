"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

export default function Header() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const avatarUrl = (session?.user as { avatarUrl?: string })?.avatarUrl;

  return (
    <header className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center shrink-0">
        <Image src="/logo.png" alt="logo" width={300} height={150} className="h-[60px] w-auto" />
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/billing"
          className="text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1 whitespace-nowrap"
        >
          完了済依頼
        </Link>
        <Link
          href="/help"
          className="text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1 whitespace-nowrap"
        >
          使い方
        </Link>
        {/* アバター＋設定 */}
        <Link href="/settings" className="flex items-center gap-1.5 hover:opacity-80 transition ml-1">
          {avatarUrl ? (
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
          )}
          <span className="text-xs text-gray-300 sm:hidden">設定</span>
          <span className="text-xs text-gray-300 hidden sm:block max-w-[80px] truncate">
            {session?.user?.name}
          </span>
        </Link>
        {/* ログアウト：アイコンのみ（モバイル）/ テキストあり（デスクトップ） */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-gray-400 hover:text-red-400 transition pl-1"
          title="ログアウト"
        >
          <span className="hidden sm:inline text-xs">ログアウト</span>
          <span className="sm:hidden text-base leading-none">⏻</span>
        </button>
      </div>
    </header>
  );
}
