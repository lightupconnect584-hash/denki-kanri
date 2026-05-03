"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

interface Project {
  id: string;
  title: string;
  location: string;
  urgency: string;
  status: string;
  dueDate: string | null;
  visitDate: string | null;
  updatedAt: string;
  assignedTo: { name: string; companyName: string | null } | null;
  inspections: { id: string }[];
  quotes: { id: string; status: string }[];
  comments: { createdAt: string }[];
}

const URGENCY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const STATUS_ORDER = ["PENDING", "INSPECTING", "QUOTE_REQUESTED", "QUOTE_RECEIVED", "INSPECTED", "COMPLETED"];
const DONE_STATUSES = ["COMPLETED", "INSPECTED", "REJECTED", "QUOTE_RECEIVED"];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [seenMap, setSeenMap] = useState<Record<string, string>>({});

  // 検索・フィルター
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("");
  const [sortMode, setSortMode] = useState<"visit" | "urgency" | "status">("visit");

  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const loadSeenMap = () => {
    try {
      const map: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("proj-seen-")) {
          map[key.replace("proj-seen-", "")] = localStorage.getItem(key) || "";
        }
      }
      setSeenMap(map);
    } catch {}
  };

  const fetchProjects = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data);
        setLoading(false);
        setRefreshing(false);
        setLastUpdated(new Date());
        loadSeenMap();
      });
  };

  useEffect(() => {
    if (status === "authenticated") fetchProjects();
  }, [status]);

  // 30秒ごとに自動更新
  useEffect(() => {
    if (status !== "authenticated") return;
    const timer = setInterval(() => fetchProjects(true), 30000);
    return () => clearInterval(timer);
  }, [status]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.title.toLowerCase().includes(q) && !p.location.toLowerCase().includes(q)) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterUrgency && p.urgency !== filterUrgency) return false;
      return true;
    });
  }, [projects, search, filterStatus, filterUrgency]);

  const activeProjects = filtered.filter((p) => !DONE_STATUSES.includes(p.status));
  const completedProjects = filtered.filter((p) => DONE_STATUSES.includes(p.status));

  const sortedActive = [...activeProjects].sort((a, b) => {
    if (sortMode === "urgency") return URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (sortMode === "visit") {
      const aV = a.visitDate ? new Date(a.visitDate).getTime() : null;
      const bV = b.visitDate ? new Date(b.visitDate).getTime() : null;
      if (aV && bV) return aV - bV;
      if (aV) return -1;
      if (bV) return 1;
    }
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  });

  const sortedCompleted = [...completedProjects].sort(
    (a, b) => new Date(b.dueDate || b.id).getTime() - new Date(a.dueDate || a.id).getTime()
  );
  const completedByMonth: Record<string, Project[]> = {};
  sortedCompleted.forEach((p) => {
    const date = p.dueDate ? new Date(p.dueDate) : null;
    const key = date ? `${date.getFullYear()}年${date.getMonth() + 1}月` : "日付なし";
    if (!completedByMonth[key]) completedByMonth[key] = [];
    completedByMonth[key].push(p);
  });

  const isUnread = (p: Project) => {
    const seen = seenMap[p.id];
    if (!seen) return true;
    const latestActivity = [p.updatedAt, ...(p.comments.map((c) => c.createdAt))].reduce(
      (a, b) => (a > b ? a : b), p.updatedAt
    );
    return latestActivity > seen;
  };

  const unreadCount = filtered.filter(isUnread).length;

  const getVisitBadge = (visitDate: string | null) => {
    if (!visitDate) return null;
    const visit = new Date(visitDate);
    const now = new Date();
    const diffDays = Math.ceil((new Date(visit).setHours(0,0,0,0) - new Date(now).setHours(0,0,0,0)) / 86400000);
    const dateStr = visit.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
    if (diffDays < 0) return null;
    if (diffDays === 0) return { text: `今日 ${dateStr}`, color: "bg-red-100 text-red-700 border border-red-200" };
    if (diffDays === 1) return { text: `明日 ${dateStr}`, color: "bg-orange-100 text-orange-700 border border-orange-200" };
    if (diffDays <= 3) return { text: `📅 ${dateStr}（${diffDays}日後）`, color: "bg-yellow-50 text-yellow-700 border border-yellow-200" };
    return { text: `📅 ${dateStr}`, color: "bg-blue-50 text-blue-600 border border-blue-100" };
  };

  const renderProject = (p: Project) => {
    const visitBadge = getVisitBadge(p.visitDate);
    const unread = isUnread(p);
    return (
      <Link key={p.id} href={`/projects/${p.id}`}
        className={`relative block bg-white rounded-xl border p-4 hover:border-blue-300 hover:shadow-sm transition ${unread ? "border-blue-400" : "border-gray-200"}`}>
        {unread && (
          <span className="absolute top-2 left-2 w-2.5 h-2.5 bg-blue-500 rounded-full" title="未確認の更新あり" />
        )}
        <div className="flex items-start justify-between gap-2">
          <div className={`flex-1 min-w-0 ${unread ? "pl-3" : ""}`}>
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-800 truncate">{p.title}</p>
              {p.urgency === "HIGH" && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">緊急</span>}
              {p.urgency === "MEDIUM" && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">中</span>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">📍 {p.location}</p>
            {p.assignedTo && (
              <p className="text-xs text-gray-400 mt-0.5">担当: {p.assignedTo.companyName || p.assignedTo.name}</p>
            )}
            {visitBadge && (
              <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${visitBadge.color}`}>
                訪問予定: {visitBadge.text}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <StatusBadge status={p.status} />
            {p.dueDate && <p className="text-xs text-gray-400">期日: {new Date(p.dueDate).toLocaleDateString("ja-JP")}</p>}
          </div>
        </div>
      </Link>
    );
  };

  if (status === "loading" || loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-800">案件一覧</h2>
            <button
              onClick={() => fetchProjects(true)}
              disabled={refreshing}
              className="text-gray-400 hover:text-blue-500 transition disabled:opacity-40"
              title="更新"
            >
              <span className={`text-base ${refreshing ? "animate-spin inline-block" : ""}`}>🔄</span>
            </button>
            {lastUpdated && (
              <span className="text-xs text-gray-400">
                {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 更新
              </span>
            )}
          </div>
          {role === "ADMIN" && (
            <Link href="/projects/new" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition">
              ＋ 新規案件
            </Link>
          )}
        </div>

        {/* 未確認通知バナー */}
        {unreadCount > 0 && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-sm text-blue-800">
            <span className="w-2.5 h-2.5 bg-blue-500 rounded-full shrink-0" />
            <span className="font-medium">{unreadCount}件</span>の案件に未確認の更新があります。青い枠の案件を確認してください。
          </div>
        )}

        {/* 検索・フィルター */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 space-y-2">
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 物件名・住所で検索"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2 flex-wrap">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全ステータス</option>
              <option value="PENDING">依頼中</option>
              <option value="INSPECTING">点検中</option>
              <option value="QUOTE_REQUESTED">見積依頼中</option>
              <option value="QUOTE_RECEIVED">確認中</option>
              <option value="INSPECTED">点検完了</option>
              <option value="COMPLETED">完了</option>
              <option value="REJECTED">却下</option>
            </select>
            <select value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全緊急度</option>
              <option value="HIGH">高</option>
              <option value="MEDIUM">中</option>
              <option value="LOW">低</option>
            </select>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
              {[
                { key: "visit", label: "訪問順" },
                { key: "urgency", label: "緊急順" },
                { key: "status", label: "状態順" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setSortMode(key as typeof sortMode)}
                  className={`px-2 py-1.5 transition ${sortMode === key ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {sortedActive.length === 0 && !showCompleted ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>{search || filterStatus || filterUrgency ? "条件に一致する案件がありません" : "進行中の案件がありません"}</p>
          </div>
        ) : (
          <div className="space-y-3">{sortedActive.map(renderProject)}</div>
        )}

        {completedProjects.length > 0 && (
          <div className="mt-6">
            <button onClick={() => setShowCompleted(!showCompleted)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 rounded-xl text-sm text-gray-600 hover:bg-gray-200 transition">
              <span>✅ 完了済み案件 ({completedProjects.length}件)</span>
              <span>{showCompleted ? "▲ 閉じる" : "▼ 表示する"}</span>
            </button>
            {showCompleted && (
              <div className="mt-3 space-y-5">
                {Object.entries(completedByMonth).map(([month, ps]) => (
                  <div key={month}>
                    <p className="text-xs font-bold text-gray-500 mb-2 px-1">📅 {month}（{ps.length}件）</p>
                    <div className="space-y-3">{ps.map(renderProject)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
