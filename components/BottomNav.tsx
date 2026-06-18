"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";

export default function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [dmUnread, setDmUnread] = useState(0);
  const [actionCount, setActionCount] = useState(0);

  const fetchBadges = useCallback(async () => {
    try {
      const [msgRes, actionRes] = await Promise.all([
        fetch("/api/messages"),
        fetch("/api/projects/action-count"),
      ]);
      if (msgRes.ok) {
        const threads: { unreadCount: number }[] = await msgRes.json();
        setDmUnread(threads.reduce((sum, t) => sum + t.unreadCount, 0));
      }
      if (actionRes.ok) {
        const data = await actionRes.json();
        setActionCount(data.count ?? 0);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchBadges();
      const id = setInterval(fetchBadges, 30000);
      return () => clearInterval(id);
    }
  }, [session?.user, fetchBadges]);

  // ログイン画面・未認証は非表示
  if (!session?.user || pathname === "/login") return null;

  const tabs = [
    {
      href: "/dashboard",
      label: "依頼",
      active: pathname === "/dashboard" || pathname.startsWith("/projects"),
      badge: actionCount,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5z" clipRule="evenodd" />
          <path fillRule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V9.375zm4.5 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75V12.375zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75zm-2.25 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75V15.375zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      href: "/messages",
      label: "チャット",
      active: pathname === "/messages",
      badge: dmUnread,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      href: "/calendar",
      label: "カレンダー",
      active: pathname === "/calendar",
      badge: 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      href: "/billing",
      label: "完了済",
      active: pathname === "/billing",
      badge: 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      href: "/settings",
      label: "設定",
      active: pathname === "/settings",
      badge: 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clipRule="evenodd" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="sm:hidden shrink-0 bg-gray-900 border-t border-gray-700"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 16px)" }}
    >
      <div className="flex h-16">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
              tab.active ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-400 rounded-full" />
            )}
            <div className="relative">
              {tab.icon}
              {tab.badge > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
