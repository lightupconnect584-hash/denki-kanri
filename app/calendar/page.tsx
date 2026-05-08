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
  workType: string | null;
  visitDate: string | null;
  visitTime: string | null;
  status: string;
  assignedTo: { id: string; name: string; companyName: string | null; color: string | null } | null;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function parseHour(visitTime: string | null): number | null {
  if (!visitTime) return null;
  const m = visitTime.match(/^(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function toDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterPartner, setFilterPartner] = useState("all");

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => {
        setProjects(data.filter((p) => p.visitDate));
        setLoading(false);
      });
  }, [status]);

  const partners = useMemo(() => {
    if (role !== "ADMIN") return [];
    const map = new Map<string, string>();
    projects.forEach((p) => {
      if (p.assignedTo?.id) map.set(p.assignedTo.id, p.assignedTo.companyName || p.assignedTo.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects, role]);

  const legend = useMemo(() => {
    if (role !== "ADMIN") return [];
    const map = new Map<string, { id: string; name: string; color: string }>();
    projects.forEach((p) => {
      const a = p.assignedTo;
      if (a?.id && a.color && !map.has(a.id)) {
        map.set(a.id, { id: a.id, name: a.companyName || a.name, color: a.color });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, role]);

  const filtered = useMemo(() => {
    if (filterPartner === "all") return projects;
    return projects.filter((p) => p.assignedTo?.id === filterPartner);
  }, [projects, filterPartner]);

  const projectsByDate = useMemo(() => {
    const map = new Map<string, Project[]>();
    filtered.forEach((p) => {
      if (!p.visitDate) return;
      const key = toDateKey(p.visitDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return map;
  }, [filtered]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const days: (string | null)[] = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return days;
  }, [viewYear, viewMonth]);

  const selectedProjects = useMemo(() => {
    if (!selectedDate) return [];
    return [...(projectsByDate.get(selectedDate) || [])].sort((a, b) => {
      const ah = parseHour(a.visitTime);
      const bh = parseHour(b.visitTime);
      if (ah === null && bh === null) return 0;
      if (ah === null) return 1;
      if (bh === null) return -1;
      return ah - bh;
    });
  }, [selectedDate, projectsByDate]);

  const upcomingProjects = useMemo(() => {
    return filtered
      .filter((p) => p.visitDate && toDateKey(p.visitDate) >= todayKey)
      .sort((a, b) => {
        const da = new Date(a.visitDate!).getTime();
        const db = new Date(b.visitDate!).getTime();
        if (da !== db) return da - db;
        const ah = parseHour(a.visitTime);
        const bh = parseHour(b.visitTime);
        if (ah === null && bh === null) return 0;
        if (ah === null) return 1;
        if (bh === null) return -1;
        return ah - bh;
      });
  }, [filtered, todayKey]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  if (status === "loading" || loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white flex-1">📅 カレンダー</h2>
            {role === "ADMIN" && (
            <select
              value={filterPartner}
              onChange={(e) => setFilterPartner(e.target.value)}
              className="border border-gray-600 bg-gray-800 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全協力会社</option>
              {partners.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
        </div>

        {/* カレンダーグリッド */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button onClick={prevMonth} className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-xl">‹</button>
            <p className="font-bold text-gray-800">{viewYear}年{viewMonth + 1}月</p>
            <button onClick={nextMonth} className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-xl">›</button>
          </div>
          <div className="grid grid-cols-7 border-b border-gray-100">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`py-2 text-center text-xs font-medium ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="h-14 border-b border-gray-50" />;
              const dayNum = parseInt(day.split("-")[2]);
              const weekday = i % 7;
              const isToday = day === todayKey;
              const isSelected = day === selectedDate;
              const dayProjects = projectsByDate.get(day) || [];

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : day)}
                  className={`h-14 flex flex-col items-center pt-1.5 pb-1 border-b border-gray-50 transition ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                >
                  <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium
                    ${isToday ? "bg-blue-600 text-white" : weekday === 0 ? "text-red-500" : weekday === 6 ? "text-blue-500" : "text-gray-800"}`}>
                    {dayNum}
                  </span>
                  {dayProjects.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 justify-center">
                      {dayProjects.slice(0, 3).map((p, j) => (
                        <span
                          key={j}
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.assignedTo?.color || "#3b82f6" }}
                        />
                      ))}
                      {dayProjects.length > 3 && <span className="text-xs text-gray-500 leading-none font-bold">+</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 凡例（管理者のみ・カラー設定済み会社） */}
        {role === "ADMIN" && legend.length > 0 && (
          <div className="flex gap-3 flex-wrap mb-4">
            {legend.map(({ id, name, color }) => (
              <div key={id} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-400">{name}</span>
              </div>
            ))}
          </div>
        )}

        {/* 選択日の案件 */}
        {selectedDate ? (
          <div>
            <p className="text-sm font-medium text-gray-300 mb-3">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })} の訪問予定
              <span className="ml-2 text-gray-500 text-xs">{selectedProjects.length}件</span>
            </p>
            {selectedProjects.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">この日の訪問予定はありません</p>
            ) : (
              <div className="space-y-2">
                {selectedProjects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex items-stretch hover:bg-gray-50 transition block">
                    <div className="w-1 shrink-0" style={{ backgroundColor: p.assignedTo?.color || "#e5e7eb" }} />
                    <div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0">
                      <div className="shrink-0 text-center w-14">
                        {p.visitTime ? (
                          <p className="text-xs font-bold text-blue-700">{p.visitTime}</p>
                        ) : (
                          <p className="text-xs text-gray-400">時間未定</p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                        {p.workType && <p className="text-xs text-gray-400 truncate">⚪︎ {p.workType}</p>}
                        {role === "ADMIN" && p.assignedTo && (
                          <p className="text-xs text-gray-400 truncate">担当: {p.assignedTo.companyName || p.assignedTo.name}</p>
                        )}
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-300 mb-3">
              今後の訪問予定
              <span className="ml-2 text-gray-500 text-xs">{upcomingProjects.length}件</span>
            </p>
            {upcomingProjects.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm">今後の訪問予定はありません</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingProjects.map((p) => {
                  const d = new Date(p.visitDate!);
                  const dk = toDateKey(p.visitDate!);
                  const isToday = dk === todayKey;
                  const dateLabel = d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
                  return (
                    <Link key={p.id} href={`/projects/${p.id}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex items-stretch hover:bg-gray-50 transition block">
                      <div className="w-1 shrink-0" style={{ backgroundColor: p.assignedTo?.color || "#e5e7eb" }} />
                      <div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0">
                        <div className="shrink-0 text-center w-16">
                          <p className={`text-xs font-bold ${isToday ? "text-blue-600" : "text-gray-700"}`}>{isToday ? "今日" : dateLabel}</p>
                          {p.visitTime ? (
                            <p className="text-xs text-blue-700 font-medium">{p.visitTime}</p>
                          ) : (
                            <p className="text-xs text-gray-400">時間未定</p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                          {p.workType && <p className="text-xs text-gray-400 truncate">⚪︎ {p.workType}</p>}
                          {role === "ADMIN" && p.assignedTo && (
                            <p className="text-xs text-gray-400 truncate">担当: {p.assignedTo.companyName || p.assignedTo.name}</p>
                          )}
                        </div>
                        <StatusBadge status={p.status} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
