"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { Caveat } from "next/font/google";

const caveat = Caveat({ subsets: ["latin"], weight: ["600"] });

export default function Header() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const avatarUrl = (session?.user as { avatarUrl?: string })?.avatarUrl;

  return (
    <header className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="text-xl">⚡</span>
        <span className={`${caveat.className} text-white text-xl tracking-wide`}>After-Service Management System</span>
      </Link>
      <div className="flex items-center gap-3">
        {role === "ADMIN" && (
          <Link
            href="/users"
            className="text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1"
          >
            ユーザー管理
          </Link>
        )}
        <Link
          href="/billing"
          className="text-xs text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-1"
        >
          💰 費用
        </Link>
        <Link href="/settings" className="flex items-center gap-2 hover:opacity-80 transition">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl.startsWith("http") ? avatarUrl : `/uploads/${avatarUrl}`}
              alt="avatar"
              className="w-7 h-7 rounded-full object-cover border border-gray-600"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white border border-gray-600">
              {session?.user?.name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <span className="text-xs text-gray-300 hidden sm:block">
            {session?.user?.name}
            {role === "ADMIN" && <span className="ml-1 text-blue-400">(管理者)</span>}
          </span>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-xs text-gray-400 hover:text-red-400"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
