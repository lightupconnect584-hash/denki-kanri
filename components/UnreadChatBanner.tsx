"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

// 💬 未読チャットがあるとき、全画面の上部に目立つバナーを出す（PC・スマホ共通）
// チャット画面を開く（＝既読になる）と自動で消える
type Thread = {
  partner: { name?: string | null; companyName?: string | null } | null;
  unreadCount: number;
};

export default function UnreadChatBanner() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [names, setNames] = useState<string[]>([]);

  const check = useCallback(async () => {
    try {
      const r = await fetch("/api/messages");
      if (!r.ok) return;
      const threads: Thread[] = await r.json();
      const withUnread = threads.filter((t) => t.unreadCount > 0);
      setCount(withUnread.reduce((s, t) => s + t.unreadCount, 0));
      setNames(
        withUnread
          .map((t) => t.partner?.companyName || t.partner?.name || "")
          .filter(Boolean)
      );
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    check();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [session?.user, check, pathname]);

  // チャット画面では出さない（開けば既読になって消える）
  if (!session?.user || pathname === "/login" || pathname === "/messages" || count === 0) return null;

  return (
    <Link
      href="/messages"
      className="block shrink-0 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition px-4 py-2.5 animate-pulse"
    >
      <p className="text-sm font-bold text-white text-center truncate">
        💬 {names.slice(0, 3).join("・")}
        {names.length > 3 ? " 他" : ""}から未読メッセージ {count}件 — タップして確認
      </p>
    </Link>
  );
}
