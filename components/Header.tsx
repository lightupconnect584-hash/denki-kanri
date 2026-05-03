"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { Caveat } from "next/font/google";

const caveat = Caveat({ subsets: ["latin"], weight: ["600"] });

export default function Header() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="text-xl">⚡</span>
        <span className={`${caveat.className} text-gray-800 text-xl tracking-wide`}>After-Service Management System</span>
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">
          {session?.user?.name}
          {role === "ADMIN" && <span className="ml-1 text-blue-600">(管理者)</span>}
        </span>
        {role === "ADMIN" && (
          <Link
            href="/users"
            className="text-xs text-gray-600 hover:text-blue-600 border border-gray-300 rounded px-2 py-1"
          >
            ユーザー管理
          </Link>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-xs text-gray-500 hover:text-red-500"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
