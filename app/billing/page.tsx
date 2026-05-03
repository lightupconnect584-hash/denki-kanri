"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface Project {
  id: string;
  title: string;
  location: string;
  status: string;
  amount: number | null;
  createdAt: string;
  assignedTo: { id: string; name: string; companyName: string | null } | null;
}

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedPartner, setSelectedPartner] = useState<string>("all");

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

  // パートナーのみ自分の案件に絞る
  const myProjects = useMemo(() => {
    if (role === "PARTNER") return projects.filter((p) => p.assignedTo?.id === userId);
    return projects;
  }, [projects, role, userId]);

  // 月一覧を生成
  const months = useMemo(() => {
    const set = new Set<string>();
    myProjects.forEach((p) => {
      const d = new Date(p.createdAt);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(set).sort().reverse();
  }, [myProjects]);

  // 協力会社一覧（管理者のみ）
  const partners = useMemo(() => {
    if (role !== "ADMIN") return [];
    const map = new Map<string, string>();
    myProjects.forEach((p) => {
      if (p.assignedTo) map.set(p.assignedTo.id, p.assignedTo.companyName || p.assignedTo.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [myProjects, role]);

  // フィルタリング
  const filtered = useMemo(() => {
    return myProjects.filter((p) => {
      if (selectedMonth !== "all") {
        const d = new Date(p.createdAt);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (m !== selectedMonth) return false;
      }
      if (selectedPartner !== "all" && p.assignedTo?.id !== selectedPartner) return false;
      return true;
    });
  }, [myProjects, selectedMonth, selectedPartner]);

  // 協力会社別に集計
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
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex gap-2 flex-wrap">
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
                    const d = new Date(p.createdAt);
                    const monthKey = `${d.getFullYear()}年${d.getMonth() + 1}月`;
                    return (
                      <div key={p.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">📍 {p.location}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{monthKey}</p>
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
