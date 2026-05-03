"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

interface Project {
  id: string;
  title: string;
  location: string;
  status: string;
  amount: number | null;
  createdAt: string;
  dueDate: string | null;
  inspections: { workDate: string }[];
  assignedTo: { id: string; name: string; companyName: string | null } | null;
}

const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedPartner, setSelectedPartner] = useState<string>("all");
  const [onlyDone, setOnlyDone] = useState(true);

  const role = (session?.user as { role?: string })?.role;
  const userId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => {
        setProjects(data.filter((p) => p.amount != null));
        setLoading(false);
      });
  }, [status]);

  const myProjects = useMemo(() => {
    if (role === "PARTNER") return projects.filter((p) => p.assignedTo?.id === userId);
    return projects;
  }, [projects, role, userId]);

  // 作業日を取得（inspectionsのworkDate最新値、なければdueDate→createdAt）
  const getWorkDate = (p: Project): Date => {
    if (p.inspections.length > 0) {
      const latest = p.inspections.reduce((a, b) =>
        new Date(a.workDate) > new Date(b.workDate) ? a : b
      );
      return new Date(latest.workDate);
    }
    return new Date(p.dueDate || p.createdAt);
  };

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // 月ラベル用のキー（作業日ベース）
  const getMonthKey = (p: Project) => {
    const d = getWorkDate(p);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const months = useMemo(() => {
    const set = new Set<string>();
    myProjects.forEach((p) => set.add(getMonthKey(p)));
    return Array.from(set).sort().reverse();
  }, [myProjects]);

  const partners = useMemo(() => {
    if (role !== "ADMIN") return [];
    const map = new Map<string, string>();
    myProjects.forEach((p) => {
      if (p.assignedTo?.id) map.set(p.assignedTo.id, p.assignedTo.companyName || p.assignedTo.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [myProjects, role]);

  const filtered = useMemo(() => {
    return myProjects.filter((p) => {
      if (onlyDone && !DONE_STATUSES.includes(p.status)) return false;
      // 過去1年以内のみ表示
      if (getWorkDate(p) < oneYearAgo) return false;
      if (selectedMonth !== "all" && getMonthKey(p) !== selectedMonth) return false;
      if (selectedPartner !== "all" && p.assignedTo?.id !== selectedPartner) return false;
      return true;
    });
  }, [myProjects, selectedMonth, selectedPartner, onlyDone]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; projects: Project[]; total: number }>();
    filtered.forEach((p) => {
      const key = p.assignedTo?.id || "unassigned";
      const name = p.assignedTo?.companyName || p.assignedTo?.name || "未担当";
      if (!map.has(key)) map.set(key, { name, projects: [], total: 0 });
      const entry = map.get(key)!;
      entry.projects.push(p);
      entry.total += p.amount || 0;
    });
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filtered]);

  const grandTotal = grouped.reduce((sum, [, g]) => sum + g.total, 0);

  if (status === "loading" || loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">読み込み中...</p></div>;
  }

  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    return `${y}年${parseInt(mo)}月`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white">
            {role === "PARTNER" ? "請求金額一覧" : "協力会社別 費用集計"}
          </h2>
        </div>

        {/* フィルター */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全期間</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            {role === "ADMIN" && (
              <select
                value={selectedPartner}
                onChange={(e) => setSelectedPartner(e.target.value)}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">全協力会社</option>
                {partners.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyDone}
              onChange={(e) => setOnlyDone(e.target.checked)}
              className="rounded"
            />
            確認済み・完了のみ表示
          </label>
        </div>

        {/* 合計金額バナー */}
        <div className="bg-blue-600 text-white rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs opacity-80 mb-0.5">
              {selectedMonth === "all" ? "累計合計" : `${monthLabel(selectedMonth)} 合計`}
            </p>
            <p className="text-2xl font-bold">¥{grandTotal.toLocaleString()}</p>
          </div>
          <p className="text-sm opacity-80">{filtered.length}件</p>
        </div>

        {grouped.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">💰</p>
            <p>該当する金額データがありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([, group]) => (
              <div key={group.name} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {role === "ADMIN" && (
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <p className="font-medium text-gray-800 text-sm">{group.name}</p>
                    <p className="text-sm font-bold text-blue-700">合計 ¥{group.total.toLocaleString()}</p>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {group.projects.map((p) => {
                    const dateStr = getWorkDate(p).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
                    return (
                      <div key={p.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">📍 {p.location}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-400">{dateStr}</p>
                            <StatusBadge status={p.status} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-800">¥{(p.amount || 0).toLocaleString()}</p>
                          <p className="text-xs text-gray-400">税別</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {role === "PARTNER" && (
                  <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex justify-between">
                    <p className="text-sm text-blue-700">
                      {selectedMonth === "all" ? "累計合計" : `${monthLabel(selectedMonth)} 合計`}
                    </p>
                    <p className="text-sm font-bold text-blue-700">¥{group.total.toLocaleString()}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
