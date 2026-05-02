"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

interface Project {
  id: string;
  title: string;
  location: string;
  status: string;
  dueDate: string | null;
  assignedTo: { name: string; companyName: string | null } | null;
  inspections: { id: string }[];
  quotes: { id: string; status: string }[];
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((data) => {
          setProjects(data);
          setLoading(false);
        });
    }
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const statusOrder = ["PENDING", "INSPECTING", "QUOTE_REQUESTED", "QUOTE_RECEIVED", "INSPECTED", "COMPLETED"];

  const DONE_STATUSES = ["COMPLETED", "INSPECTED", "REJECTED"];
  const activeProjects = projects.filter((p) => !DONE_STATUSES.includes(p.status));
  const completedProjects = projects.filter((p) => DONE_STATUSES.includes(p.status));

  const sortedActive = [...activeProjects].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
  );
  const sortedCompleted = [...completedProjects].sort(
    (a, b) => new Date(b.dueDate || b.id).getTime() - new Date(a.dueDate || a.id).getTime()
  );

  // 月ごとにグループ化
  const completedByMonth: Record<string, Project[]> = {};
  sortedCompleted.forEach((p) => {
    const date = p.dueDate ? new Date(p.dueDate) : null;
    const key = date
      ? `${date.getFullYear()}年${date.getMonth() + 1}月`
      : "日付なし";
    if (!completedByMonth[key]) completedByMonth[key] = [];
    completedByMonth[key].push(p);
  });

  const renderProject = (p: Project) => (
    <Link
      key={p.id}
      href={`/projects/${p.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 truncate">{p.title}</p>
          <p className="text-sm text-gray-500 mt-0.5">📍 {p.location}</p>
          {p.assignedTo && (
            <p className="text-xs text-gray-400 mt-0.5">
              担当: {p.assignedTo.companyName || p.assignedTo.name}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={p.status} />
          {p.dueDate && (
            <p className="text-xs text-gray-400">
              期日: {new Date(p.dueDate).toLocaleDateString("ja-JP")}
            </p>
          )}
        </div>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-800">案件一覧</h2>
          {role === "ADMIN" && (
            <Link
              href="/projects/new"
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              ＋ 新規案件
            </Link>
          )}
        </div>

        {activeProjects.length === 0 && !showCompleted ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>進行中の案件がありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedActive.map(renderProject)}
          </div>
        )}

        {/* 完了済み案件 */}
        {completedProjects.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 rounded-xl text-sm text-gray-600 hover:bg-gray-200 transition"
            >
              <span>✅ 完了済み案件 ({completedProjects.length}件)</span>
              <span>{showCompleted ? "▲ 閉じる" : "▼ 表示する"}</span>
            </button>

            {showCompleted && (
              <div className="mt-3 space-y-5">
                {Object.entries(completedByMonth).map(([month, ps]) => (
                  <div key={month}>
                    <p className="text-xs font-bold text-gray-500 mb-2 px-1">📅 {month}（{ps.length}件）</p>
                    <div className="space-y-3">
                      {ps.map(renderProject)}
                    </div>
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
