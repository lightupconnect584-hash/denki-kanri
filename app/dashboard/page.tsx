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
  urgency: string;
  status: string;
  amount: number | null;
  dueDate: string | null;
  visitDate: string | null;
  updatedAt: string;
  notifyAdminAt: string | null;
  notifyPartnerAt: string | null;
  assignedTo: { id: string; name: string; companyName: string | null } | null;
  inspections: { id: string; workDate: string }[];
  quotes: { id: string; status: string }[];
  comments: { createdAt: string }[];
  createdBy: { name: string; avatarUrl: string | null; thankYouEnabled: boolean; thankYouImageUrl: string | null; thankYouMessage: string | null };
}

const URGENCY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const STATUS_ORDER = ["PENDING", "REWORK", "ACCEPTED", "INSPECTED", "QUOTE_REQUESTED", "QUOTE_REVIEWING", "CONFIRMED", "COMPLETED", "REJECTED"];
const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [seenMap, setSeenMap] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const map: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("proj-seen-")) {
          map[key.replace("proj-seen-", "")] = localStorage.getItem(key) || "";
        }
      }
      return map;
    } catch { return {}; }
  });

  // 検索・フィルター
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("");
  const [sortMode, setSortMode] = useState<"visit" | "urgency" | "status" | "region">("visit");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterPartner, setFilterPartner] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showMonthlyThanks, setShowMonthlyThanks] = useState(false);
  const [monthlyAdmin, setMonthlyAdmin] = useState<{ name: string; thankYouImageUrl: string | null; avatarUrl: string | null; thankYouMessage: string | null } | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [showSeasonal, setShowSeasonal] = useState(false);
  const [seasonalMsg, setSeasonalMsg] = useState("");
  const [seasonalImageUrl, setSeasonalImageUrl] = useState<string | null>(null);
  const [seasonalAnimation, setSeasonalAnimation] = useState("none");
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{ label: string; count: number; breakdown: { company: string; count: number }[] } | null>(null);

  const role = (session?.user as { role?: string })?.role;

  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (role !== "ADMIN") return;
    const CACHE_KEY = "storage-warning-cache";
    const CACHE_TTL = 6 * 60 * 60 * 1000; // 6時間
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts, msg } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) { setStorageWarning(msg); return; }
      }
    } catch {}
    fetch("/api/admin/storage").then(r => r.json()).then(data => {
      const warnings: string[] = [];
      const pctDb = Math.round((data.db.used / data.db.limit) * 100);
      const pctBlob = Math.round((data.blob.used / data.blob.limit) * 100);
      if (pctDb >= 90) warnings.push(`DB ${pctDb}%`);
      else if (pctDb >= 80) warnings.push(`DB ${pctDb}%`);
      if (pctBlob >= 90) warnings.push(`写真 ${pctBlob}%`);
      else if (pctBlob >= 80) warnings.push(`写真 ${pctBlob}%`);
      const msg = warnings.length > 0 ? warnings.join("・") : null;
      setStorageWarning(msg);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), msg })); } catch {}
    }).catch(() => {});
  }, [role]);

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
      .then((data: Project[]) => {
        setProjects(data);
        setLoading(false);
        setRefreshing(false);
        setLastUpdated(new Date());
        loadSeenMap();
        // 各種通知（協力会社・初回ロードのみ）
        if (!isRefresh && role === "PARTNER") {
          try {
            const today = new Date();
            const m = today.getMonth() + 1;
            const d = today.getDate();
            const y = today.getFullYear();
            const adminProject = data.find((p) => p.createdBy?.thankYouEnabled);

            // 月末メッセージ
            const lastDay = new Date(y, m, 0).getDate();
            const monthKey = `monthly-thanks-${y}-${m}`;
            if (d >= lastDay - 2 && localStorage.getItem(monthKey) !== "1") {
              if (adminProject) {
                setMonthlyAdmin(adminProject.createdBy);
                setShowMonthlyThanks(true);
                localStorage.setItem(monthKey, "1");
              }
            }

            // 月初サマリー（1〜3日）
            if (d <= 3) {
              const summaryKey = `monthly-summary-${y}-${m}`;
              if (localStorage.getItem(summaryKey) !== "1") {
                const prevMonth = m === 1 ? 12 : m - 1;
                const prevYear = m === 1 ? y - 1 : y;
                const prevKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
                const lastMonthDone = data.filter((p) => {
                  if (!["CONFIRMED", "COMPLETED"].includes(p.status)) return false;
                  const ins = p.inspections;
                  const dateStr = ins.length > 0
                    ? ins.reduce((a: typeof ins[0], b: typeof ins[0]) => new Date(a.workDate) > new Date(b.workDate) ? a : b).workDate
                    : p.dueDate;
                  if (!dateStr) return false;
                  const dd = new Date(dateStr);
                  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}` === prevKey;
                });
                if (lastMonthDone.length > 0) {
                  const breakdown = Object.entries(
                    lastMonthDone.reduce<Record<string, number>>((acc, p) => {
                      const name = p.assignedTo?.companyName || p.assignedTo?.name || "未割当";
                      acc[name] = (acc[name] ?? 0) + 1;
                      return acc;
                    }, {})
                  ).map(([company, count]) => ({ company, count }))
                    .sort((a, b) => b.count - a.count);
                  setSummaryData({ label: `${prevYear}年${prevMonth}月`, count: lastMonthDone.length, breakdown });
                  setShowSummary(true);
                  localStorage.setItem(summaryKey, "1");
                }
              }
            }

            // 案件完了通知
            const completed = data.find((p) =>
              ["CONFIRMED", "COMPLETED"].includes(p.status) &&
              localStorage.getItem(`completion-seen-${p.id}`) !== "1"
            );
            if (completed) {
              setCompletionNotice(completed.title);
              localStorage.setItem(`completion-seen-${completed.id}`, "1");
              setTimeout(() => setCompletionNotice(null), 5000);
            }
          } catch {}
        }
      });
  };

  useEffect(() => {
    if (status === "authenticated") fetchProjects();
  }, [status]);

  // 画面に戻ってきた時にseenMapを再読み込み
  useEffect(() => {
    const onFocus = () => { loadSeenMap(); fetchProjects(true); };
    const onVisible = () => {
      if (document.visibilityState === "visible") { loadSeenMap(); fetchProjects(true); }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 30秒ごとに自動更新
  useEffect(() => {
    if (status !== "authenticated") return;
    const timer = setInterval(() => fetchProjects(true), 30000);
    return () => clearInterval(timer);
  }, [status]);

  // 季節メッセージをDBから取得（パートナーのみ）
  useEffect(() => {
    if (status !== "authenticated" || role !== "PARTNER") return;
    fetch("/api/seasonal-messages?mine=true")
      .then((r) => r.json())
      .then((msgs: { id: string; startMD: number; endMD: number; message: string; imageUrl: string | null; animation: string; enabled: boolean }[]) => {
        try {
          const today = new Date();
          const md = (today.getMonth() + 1) * 100 + today.getDate();
          const y = today.getFullYear();
          const active = msgs.find((m) => m.enabled && md >= m.startMD && md <= m.endMD);
          if (active) {
            const key = `seasonal-${active.id}-${y}`;
            if (localStorage.getItem(key) !== "1") {
              setSeasonalMsg(active.message);
              setSeasonalImageUrl(active.imageUrl || null);
              setSeasonalAnimation(active.animation || "none");
              setShowSeasonal(true);
              localStorage.setItem(key, "1");
            }
          }
        } catch {}
      })
      .catch(() => {});
  }, [status, role]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.title.toLowerCase().includes(q) && !p.location.toLowerCase().includes(q) && !(p.workType || "").toLowerCase().includes(q)) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterUrgency && p.urgency !== filterUrgency) return false;
      if (filterRegion && !p.location.includes(filterRegion)) return false;
      if (filterPartner && p.assignedTo?.id !== filterPartner) return false;
      return true;
    });
  }, [projects, search, filterStatus, filterUrgency, filterRegion, filterPartner]);

  const partners = useMemo(() => {
    if (role !== "ADMIN") return [];
    const map = new Map<string, string>();
    projects.forEach((p) => {
      if (p.assignedTo?.id) map.set(p.assignedTo.id, p.assignedTo.companyName || p.assignedTo.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects, role]);

  // 作業日を取得（inspectionsのworkDate最新値、なければupdatedAt）
  const getWorkDate = (p: Project): Date | null => {
    if (p.inspections.length > 0) {
      const latest = p.inspections.reduce((a, b) =>
        new Date(a.workDate) > new Date(b.workDate) ? a : b
      );
      return new Date(latest.workDate);
    }
    // 検査記録なしの場合はステータス確定日（updatedAt）を使用
    return new Date(p.updatedAt);
  };

  const markAllRead = () => {
    const now = new Date().toISOString();
    const updates: Record<string, string> = {};
    activeProjects.forEach((p) => {
      if (isUnread(p)) {
        try { localStorage.setItem(`proj-seen-${p.id}`, now); } catch {}
        updates[p.id] = now;
      }
    });
    if (Object.keys(updates).length > 0) {
      setSeenMap((prev) => ({ ...prev, ...updates }));
    }
  };

  const isUnread = (p: Project) => {
    const seen = seenMap[p.id];
    const notifyAt = role === "ADMIN" ? p.notifyAdminAt : p.notifyPartnerAt;
    if (!notifyAt) return false;
    if (!seen) return true;
    return notifyAt > seen;
  };

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const activeProjects = filtered.filter((p) => !DONE_STATUSES.includes(p.status) && p.status !== "REJECTED");
  const activePerCompany = activeProjects.reduce<Record<string, number>>((acc, p) => {
    const id = p.assignedTo?.id ?? "__none";
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});
  const maxPerCompany = Math.max(0, ...Object.values(activePerCompany));
  // 完了済みは当月分のみ表示
  const completedProjects = filtered.filter((p) => {
    if (!DONE_STATUSES.includes(p.status)) return false;
    const d = getWorkDate(p);
    if (!d) return false;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return key === currentMonthKey;
  });
  const rejectedProjects = filtered.filter((p) => p.status === "REJECTED");

  const sortedActive = [...activeProjects].sort((a, b) => {
    // 未読を常に上位
    const aU = isUnread(a) ? 0 : 1;
    const bU = isUnread(b) ? 0 : 1;
    if (aU !== bU) return aU - bU;
    if (sortMode === "urgency") return URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (sortMode === "region") return a.location.localeCompare(b.location, "ja");
    if (sortMode === "visit") {
      const aV = a.visitDate ? new Date(a.visitDate).getTime() : null;
      const bV = b.visitDate ? new Date(b.visitDate).getTime() : null;
      if (aV && bV) return aV - bV;
      if (aV) return -1;
      if (bV) return 1;
    }
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  });

  const unreadCount = filtered.filter((p) => !DONE_STATUSES.includes(p.status) && p.status !== "REJECTED" && isUnread(p)).length;

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

  const abbrevAddr = (addr: string) => addr.replace(/[0-9].*$/, "").trim();

  const WIND_P = [
    {c:"rgba(34,197,94,0.85)",w:20,h:7,dur:2.8,del:0},{c:"rgba(74,222,128,0.75)",w:15,h:5,dur:3.5,del:0.5},
    {c:"rgba(22,163,74,0.65)",w:22,h:8,dur:2.5,del:1.0},{c:"rgba(134,239,172,0.80)",w:12,h:5,dur:4.0,del:0.3},
    {c:"rgba(74,222,128,0.90)",w:18,h:6,dur:3.2,del:1.5},{c:"rgba(34,197,94,0.60)",w:10,h:4,dur:2.6,del:0.8},
    {c:"rgba(22,163,74,0.70)",w:25,h:8,dur:3.8,del:0.2},{c:"rgba(134,239,172,0.70)",w:14,h:5,dur:2.9,del:1.2},
    {c:"rgba(74,222,128,0.85)",w:16,h:6,dur:3.4,del:0.6},{c:"rgba(34,197,94,0.60)",w:20,h:7,dur:2.7,del:1.8},
    {c:"rgba(167,243,208,0.75)",w:13,h:5,dur:4.2,del:0.4},{c:"rgba(22,163,74,0.65)",w:18,h:6,dur:3.1,del:1.1},
    {c:"rgba(74,222,128,0.80)",w:11,h:4,dur:2.4,del:0.9},{c:"rgba(134,239,172,0.70)",w:23,h:8,dur:3.7,del:1.4},
    {c:"rgba(34,197,94,0.85)",w:15,h:5,dur:3.0,del:0.7},
  ];
  const WIND_TOPS = [5,12,20,28,36,45,53,62,70,78,86,15,33,58,73];

  const renderAnimation = (type: string) => {
    if (type === "none") return null;

    if (type === "sun") {
      const rayDegs = [0,25,50,75,100,125,150,170];
      const sparkles = [
        {l:"18%",t:"18%",s:5,dur:2.2,del:0.0},{l:"32%",t:"8%",s:3,dur:1.8,del:0.6},
        {l:"8%",t:"35%",s:4,dur:2.5,del:1.1},{l:"48%",t:"14%",s:3,dur:2.0,del:0.3},
        {l:"62%",t:"28%",s:4,dur:2.3,del:1.4},{l:"22%",t:"48%",s:3,dur:1.9,del:0.8},
      ];
      return (<>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 92% -5%, rgba(255,200,50,0.22) 0%, rgba(255,170,0,0.07) 45%, transparent 65%)",pointerEvents:"none"}} />
        {rayDegs.map((deg,i)=>(
          <div key={i} style={{position:"absolute",top:"15px",right:"15px",width:`${60+i%3*18}px`,height:"3px",background:"linear-gradient(to left, rgba(255,220,80,0), rgba(255,210,60,0.9))",transformOrigin:"right center",transform:`rotate(${deg}deg)`,animation:`sunray ${3+i*0.4}s ${i*0.2}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <div style={{position:"absolute",top:"-50px",right:"-50px",width:"130px",height:"130px",borderRadius:"50%",background:"radial-gradient(circle, #fff7a0 0%, #ffd700 45%, rgba(255,180,0,0) 100%)",boxShadow:"0 0 45px 22px rgba(255,210,50,0.40)",animation:"sunpulse 2.8s ease-in-out infinite",pointerEvents:"none"}} />
        {sparkles.map((sp,i)=>(
          <div key={`s${i}`} style={{position:"absolute",left:sp.l,top:sp.t,width:`${sp.s}px`,height:`${sp.s}px`,borderRadius:"50%",background:"rgba(255,240,100,0.95)",animation:`sunspk ${sp.dur}s ${sp.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`
          @keyframes sunpulse{0%,100%{transform:scale(1);opacity:0.85}50%{transform:scale(1.1);opacity:1}}
          @keyframes sunray{0%,100%{opacity:0.2}50%{opacity:0.95}}
          @keyframes sunspk{0%,100%{transform:scale(0.2);opacity:0}45%,55%{transform:scale(1);opacity:1}}
        `}</style>
      </>);
    }

    if (type === "snow") {
      const flakes = [
        {s:5,l:8,dur:5.5,del:0},{s:3,l:15,dur:7.0,del:0.8},{s:7,l:22,dur:6.2,del:1.5},
        {s:4,l:30,dur:8.0,del:0.3},{s:6,l:38,dur:5.8,del:1.8},{s:3,l:45,dur:7.5,del:0.6},
        {s:8,l:52,dur:6.5,del:1.2},{s:4,l:60,dur:5.2,del:2.0},{s:5,l:68,dur:7.2,del:0.4},
        {s:3,l:75,dur:6.8,del:1.6},{s:7,l:82,dur:5.5,del:0.9},{s:4,l:90,dur:8.2,del:0.2},
        {s:5,l:12,dur:6.0,del:1.4},{s:6,l:35,dur:7.8,del:0.7},{s:3,l:58,dur:5.9,del:1.1},{s:5,l:78,dur:6.4,del:1.9},
      ];
      return (<>
        {flakes.map((f,i)=>(
          <div key={i} style={{position:"absolute",left:`${f.l}%`,top:"-12px",width:`${f.s}px`,height:`${f.s}px`,background:`rgba(220,240,255,${0.7+(i%4)*0.08})`,borderRadius:"50%",animation:`dsnow ${f.dur}s ${f.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes dsnow{0%{transform:translateX(0) translateY(0);opacity:0.9}20%{transform:translateX(8px) translateY(22vh)}40%{transform:translateX(-7px) translateY(44vh)}60%{transform:translateX(9px) translateY(66vh)}80%{transform:translateX(-5px) translateY(88vh)}100%{transform:translateX(4px) translateY(112vh);opacity:0.7}}`}</style>
      </>);
    }

    if (type === "confetti") {
      const pieces = [
        {c:"#f87171",l:8,s:8,dur:3.2,del:0},{c:"#60a5fa",l:15,s:6,dur:4.0,del:0.5},
        {c:"#34d399",l:22,s:9,dur:3.5,del:1.0},{c:"#fbbf24",l:30,s:7,dur:3.8,del:0.3},
        {c:"#a78bfa",l:38,s:8,dur:4.2,del:1.5},{c:"#f472b6",l:45,s:6,dur:3.0,del:0.7},
        {c:"#38bdf8",l:52,s:9,dur:4.5,del:1.2},{c:"#fb923c",l:60,s:7,dur:3.3,del:0.2},
        {c:"#4ade80",l:68,s:8,dur:4.0,del:1.8},{c:"#e879f9",l:75,s:6,dur:3.7,del:0.6},
        {c:"#f87171",l:82,s:9,dur:3.5,del:1.1},{c:"#60a5fa",l:90,s:7,dur:4.3,del:0.4},
      ];
      return (<>
        {pieces.map((p,i)=>(
          <div key={i} style={{position:"absolute",left:`${p.l}%`,top:"-10px",width:`${p.s}px`,height:`${p.s}px`,background:p.c,borderRadius:i%3===0?"50%":"2px",animation:`dconf ${p.dur}s ${p.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes dconf{0%{transform:translateX(0) translateY(0) rotate(0deg) scaleX(1)}12%{transform:translateX(14px) translateY(12vh) rotate(60deg) scaleX(0.3)}25%{transform:translateX(-10px) translateY(25vh) rotate(120deg) scaleX(1)}38%{transform:translateX(16px) translateY(38vh) rotate(200deg) scaleX(0.2)}50%{transform:translateX(-12px) translateY(50vh) rotate(270deg) scaleX(1)}62%{transform:translateX(10px) translateY(62vh) rotate(340deg) scaleX(0.3)}75%{transform:translateX(-8px) translateY(75vh) rotate(410deg) scaleX(1)}88%{transform:translateX(12px) translateY(88vh) rotate(480deg) scaleX(0.4)}100%{transform:translateX(-5px) translateY(112vh) rotate(540deg) scaleX(1)}}`}</style>
      </>);
    }

    if (type === "rain") {
      const drops = [8,15,22,30,38,45,52,60,68,75,82,90,12,25,48,65,78,35,55,20].map((l,i)=>({l,dur:1.2+(i%5)*0.15,del:(i%4)*0.25}));
      return (<>
        {drops.map((d,i)=>(
          <div key={i} style={{position:"absolute",left:`${d.l}%`,top:"-10px",width:"2px",height:"14px",background:`rgba(147,197,253,${0.5+i%3*0.2})`,borderRadius:"1px",animation:`dfall-rain ${d.dur}s ${d.del}s linear infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes dfall-rain{to{transform:translateY(110vh) translateX(18px)}}`}</style>
      </>);
    }

    if (type === "cracker") {
      const dirs = [
        {tx:-90,ty:-150},{tx:-60,ty:-185},{tx:-25,ty:-200},{tx:15,ty:-200},
        {tx:50,ty:-190},{tx:80,ty:-165},{tx:105,ty:-130},{tx:120,ty:-95}
      ];
      const COLORS = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43","#ff6b6b","#4d96ff"];
      const CRACKERS = [{x:"18%",bd:0},{x:"50%",bd:1.5},{x:"82%",bd:3.0}];
      return (<>
        {CRACKERS.flatMap((cr,ci)=>dirs.map((d,di)=>(
          <div key={`${ci}-${di}`} style={{position:"absolute",bottom:"8%",left:cr.x,width:di%3===0?"8px":"6px",height:di%3===0?"8px":"6px",background:COLORS[di],borderRadius:di%2===0?"50%":"2px",animation:`crk-d${di} 4.5s ${cr.bd+di*0.04}s ease-in infinite backwards`,pointerEvents:"none"}} />
        )))}
        <style>{`
          @keyframes crk-d0{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(-90px,-150px);opacity:0.9}100%{transform:translate(-110px,180px);opacity:0}}
          @keyframes crk-d1{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(-60px,-185px);opacity:0.9}100%{transform:translate(-75px,180px);opacity:0}}
          @keyframes crk-d2{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(-25px,-200px);opacity:0.9}100%{transform:translate(-30px,180px);opacity:0}}
          @keyframes crk-d3{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(15px,-200px);opacity:0.9}100%{transform:translate(20px,180px);opacity:0}}
          @keyframes crk-d4{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(50px,-190px);opacity:0.9}100%{transform:translate(60px,180px);opacity:0}}
          @keyframes crk-d5{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(80px,-165px);opacity:0.9}100%{transform:translate(100px,180px);opacity:0}}
          @keyframes crk-d6{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(105px,-130px);opacity:0.9}100%{transform:translate(130px,180px);opacity:0}}
          @keyframes crk-d7{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(120px,-95px);opacity:0.9}100%{transform:translate(145px,180px);opacity:0}}
        `}</style>
      </>);
    }

    if (type === "thunder") {
      const drops = [5,10,14,18,22,27,31,35,40,44,48,52,57,61,65,70,74,78,83,87,91,3,20,38,55,72].map((l,i)=>({l,dur:0.55+(i%4)*0.1,del:(i%7)*0.12}));
      return (<>
        {drops.map((d,i)=>(
          <div key={i} style={{position:"absolute",left:`${d.l}%`,top:"-10px",width:"2px",height:"18px",background:`rgba(130,180,255,${0.6+i%3*0.2})`,borderRadius:"1px",animation:`thr-rain ${d.dur}s ${d.del}s linear infinite`,pointerEvents:"none"}} />
        ))}
        <div style={{position:"absolute",inset:0,animation:"lflash1 6s linear 0.3s infinite normal backwards",pointerEvents:"none",background:"rgba(255,255,255,0.95)"}} />
        <div style={{position:"absolute",inset:0,animation:"lflash2 9s linear 3.5s infinite normal backwards",pointerEvents:"none",background:"rgba(255,255,200,0.9)"}} />
        <div style={{position:"absolute",inset:0,animation:"lflash3 7s linear 6.0s infinite normal backwards",pointerEvents:"none",background:"rgba(255,255,255,0.95)"}} />
        <style>{`
          @keyframes thr-rain{to{transform:translateY(110vh) translateX(15px)}}
          @keyframes lflash1{0%,100%{opacity:0}2%{opacity:1}4%{opacity:0.05}6%{opacity:0.8}9%,100%{opacity:0}}
          @keyframes lflash2{0%,100%{opacity:0}3%{opacity:0.9}5%{opacity:0}7%{opacity:0.7}10%,100%{opacity:0}}
          @keyframes lflash3{0%,100%{opacity:0}2.5%{opacity:1}4.5%{opacity:0.1}7%{opacity:0.85}10%,100%{opacity:0}}
        `}</style>
      </>);
    }

    if (type === "wind") {
      return (<>
        {WIND_P.map((p,i)=>(
          <div key={i} style={{position:"absolute",left:"-50px",top:`${WIND_TOPS[i]}%`,width:`${p.w}px`,height:`${p.h}px`,background:p.c,borderRadius:"50%",animation:`wfall ${p.dur}s ${p.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes wfall{0%{transform:translateX(0px) translateY(0px) rotate(0deg);opacity:0}8%{opacity:0.9}25%{transform:translateX(25vw) translateY(-45px) rotate(140deg)}50%{transform:translateX(52vw) translateY(35px) rotate(290deg)}75%{transform:translateX(80vw) translateY(-30px) rotate(430deg)}92%{opacity:0.85}100%{transform:translateX(120vw) translateY(20px) rotate(580deg);opacity:0}}`}</style>
      </>);
    }

    if (type === "sakura") {
      const petals = [
        {l:5,s:9,dur:4.5,del:0},{l:12,s:7,dur:5.2,del:0.8},{l:20,s:10,dur:4.0,del:1.5},
        {l:28,s:8,dur:5.8,del:0.3},{l:36,s:9,dur:4.3,del:1.8},{l:44,s:7,dur:5.5,del:0.6},
        {l:52,s:10,dur:4.8,del:1.2},{l:60,s:8,dur:5.0,del:2.0},{l:68,s:9,dur:4.2,del:0.4},
        {l:75,s:7,dur:5.3,del:1.6},{l:82,s:10,dur:4.6,del:0.9},{l:90,s:8,dur:5.7,del:0.2},
        {l:15,s:9,dur:4.9,del:1.4},{l:38,s:7,dur:5.1,del:0.7},{l:62,s:8,dur:4.4,del:1.9},{l:78,s:9,dur:5.4,del:1.1},
      ];
      return (<>
        {petals.map((p,i)=>(
          <div key={i} style={{position:"absolute",left:`${p.l}%`,top:"-12px",width:`${p.s*1.4}px`,height:`${p.s}px`,background:`rgba(255,${150+i%4*20},${175+i%3*15},${0.75+i%3*0.07})`,borderRadius:"50% 50% 50% 50% / 60% 60% 40% 40%",animation:`sakfall ${p.dur}s ${p.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes sakfall{0%{transform:translateX(0) translateY(0) rotate(0deg);opacity:0.9}15%{transform:translateX(12px) translateY(15vh) rotate(45deg)}30%{transform:translateX(-8px) translateY(30vh) rotate(100deg)}45%{transform:translateX(15px) translateY(45vh) rotate(160deg)}60%{transform:translateX(-10px) translateY(60vh) rotate(220deg)}75%{transform:translateX(8px) translateY(75vh) rotate(280deg)}100%{transform:translateX(-5px) translateY(112vh) rotate(360deg);opacity:0.7}}`}</style>
      </>);
    }

    if (type === "leaves") {
      const LC = ["#f97316","#ef4444","#b45309","#fbbf24","#dc2626","#92400e","#ea580c","#ca8a04"];
      const leaves = [5,12,20,28,36,44,52,60,68,75,82,90,18,55].map((l,i)=>({l,s:8+i%3*2,dur:4.5+i%4*0.8,del:i*0.3,c:LC[i%8]}));
      return (<>
        {leaves.map((lf,i)=>(
          <div key={i} style={{position:"absolute",left:`${lf.l}%`,top:"-14px",width:`${lf.s}px`,height:`${Math.round(lf.s*1.3)}px`,background:lf.c,borderRadius:"60% 20% 60% 20%",animation:`leaffall ${lf.dur}s ${lf.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes leaffall{0%{transform:translateX(0) translateY(0) rotate(0deg);opacity:0.95}20%{transform:translateX(18px) translateY(20vh) rotate(80deg)}40%{transform:translateX(-14px) translateY(40vh) rotate(180deg)}60%{transform:translateX(20px) translateY(60vh) rotate(260deg)}80%{transform:translateX(-10px) translateY(80vh) rotate(350deg)}100%{transform:translateX(15px) translateY(112vh) rotate(440deg);opacity:0.6}}`}</style>
      </>);
    }

    if (type === "wave") {
      return (<>
        <div style={{position:"absolute",bottom:0,left:"-20%",width:"140%",height:"120px",background:"rgba(59,130,246,0.22)",borderRadius:"100% 100% 0 0",animation:"wave1 3.5s ease-in-out infinite",pointerEvents:"none"}} />
        <div style={{position:"absolute",bottom:0,left:"-15%",width:"130%",height:"90px",background:"rgba(96,165,250,0.18)",borderRadius:"100% 100% 0 0",animation:"wave2 4.2s 0.8s ease-in-out infinite",pointerEvents:"none"}} />
        <div style={{position:"absolute",bottom:0,left:"-25%",width:"150%",height:"65px",background:"rgba(186,230,253,0.20)",borderRadius:"100% 100% 0 0",animation:"wave3 2.8s 1.5s ease-in-out infinite",pointerEvents:"none"}} />
        {[15,30,48,65,80,95].map((l,i)=>(
          <div key={i} style={{position:"absolute",bottom:`${35+i%3*18}px`,left:`${l}%`,width:"3px",height:"3px",borderRadius:"50%",background:"rgba(255,255,255,0.75)",animation:`wspk 2s ${i*0.35}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`
          @keyframes wave1{0%,100%{transform:translateY(0) translateX(0)}50%{transform:translateY(-30px) translateX(15px)}}
          @keyframes wave2{0%,100%{transform:translateY(-8px) translateX(0)}50%{transform:translateY(-22px) translateX(-12px)}}
          @keyframes wave3{0%,100%{transform:translateY(-4px) translateX(8px)}50%{transform:translateY(-24px) translateX(-8px)}}
          @keyframes wspk{0%,100%{opacity:0;transform:scale(0.5)}50%{opacity:0.85;transform:scale(1.3)}}
        `}</style>
      </>);
    }

    if (type === "stars") {
      const stPos = [
        {l:5,t:8},{l:12,t:22},{l:18,t:5},{l:25,t:32},{l:32,t:15},
        {l:38,t:28},{l:45,t:8},{l:52,t:40},{l:58,t:18},{l:65,t:12},
        {l:72,t:35},{l:78,t:5},{l:85,t:25},{l:92,t:18},{l:8,t:48},
        {l:22,t:55},{l:35,t:42},{l:48,t:62},{l:62,t:50},{l:75,t:58},
        {l:88,t:45},{l:15,t:70},{l:42,t:75},{l:68,t:68},{l:82,t:80},
      ];
      return (<>
        {stPos.map((st,i)=>(
          <div key={i} style={{position:"absolute",left:`${st.l}%`,top:`${st.t}%`,width:`${2+i%3}px`,height:`${2+i%3}px`,borderRadius:"50%",background:`rgba(255,${235+i%3*7},${160+i%4*18},${0.8+i%4*0.05})`,animation:`startwinkle ${1.5+i%5*0.4}s ${i*0.14}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes startwinkle{0%,100%{opacity:0.12;transform:scale(0.7)}50%{opacity:1;transform:scale(1.3)}}`}</style>
      </>);
    }

    if (type === "fireworks") {
      const FWC = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43","#ff6bde","#6bffd6","#fff06b","#ffb6c1","#4d96ff","#c77dff"];
      const LAUNCHES = [{x:"25%",y:"22%",bd:0},{x:"65%",y:"18%",bd:1.8},{x:"45%",y:"38%",bd:3.5}];
      const PEAKS = [[110,0],[95,55],[55,95],[0,110],[-55,95],[-95,55],[-110,0],[-95,-55],[-55,-95],[0,-110],[55,-95],[95,-55]];
      const ENDS  = [[143,50],[124,105],[72,145],[0,160],[-72,145],[-124,105],[-143,50],[-124,-5],[-72,-45],[0,-60],[72,-45],[124,-5]];
      const fwKF = PEAKS.map(([px,py],i)=>`@keyframes fw-${i}{0%,4%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(${px}px,${py}px);opacity:0.9}100%{transform:translate(${ENDS[i][0]}px,${ENDS[i][1]}px);opacity:0}}`).join("");
      return (<>
        {LAUNCHES.flatMap((lch,li)=>FWC.map((_,ai)=>(
          <div key={`${li}-${ai}`} style={{position:"absolute",left:lch.x,top:lch.y,width:"5px",height:"5px",borderRadius:"50%",background:FWC[ai],animation:`fw-${ai} 3.5s ${lch.bd+ai*0.025}s ease-out infinite backwards`,pointerEvents:"none"}} />
        )))}
        <style>{fwKF}</style>
      </>);
    }

    return null;
  };

  const renderProject = (p: Project) => {
    const visitBadge = getVisitBadge(p.visitDate);
    const unread = isUnread(p);
    return (
      <Link key={p.id} href={`/projects/${p.id}`}
        className={`relative block rounded-xl border p-4 hover:shadow-sm transition overflow-hidden ${unread ? "bg-blue-50 border-blue-400 border-2" : "bg-white border-gray-200 hover:border-blue-300"}`}>
        {unread && (
          <span className="absolute inset-y-0 left-0 w-2 bg-blue-500" />
        )}
        <div className="flex items-start justify-between gap-2">
          <div className={`flex-1 min-w-0 ${unread ? "pl-3" : ""}`}>
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-800 truncate">{p.title}</p>
              {p.urgency === "HIGH" && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">緊急</span>}
              {p.urgency === "MEDIUM" && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">中</span>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">📍 {p.location}</p>
            {p.workType && (
              <p className="text-xs text-gray-600 mt-0.5 font-medium">⚪︎ {p.workType}</p>
            )}
            {role === "ADMIN" && p.assignedTo && (
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
      {/* 月末お礼モーダル */}
      {showMonthlyThanks && monthlyAdmin && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 px-6"
          onClick={() => setShowMonthlyThanks(false)}
        >
          <div
            className="bg-white rounded-3xl p-8 flex flex-col items-center max-w-xs w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4" style={{ animation: "bow 1.2s ease-in-out infinite" }}>
              {(monthlyAdmin.thankYouImageUrl || monthlyAdmin.avatarUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(() => {
                    const url = monthlyAdmin.thankYouImageUrl || monthlyAdmin.avatarUrl;
                    return url?.startsWith("http") ? url : `/uploads/${url}`;
                  })()}
                  alt="感謝"
                  className="w-24 h-24 rounded-full object-cover border-4 border-blue-100"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white border-4 border-blue-100">
                  {monthlyAdmin.name[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <p className="text-sm text-gray-700 mb-6 text-center whitespace-pre-line">
              {monthlyAdmin.thankYouMessage || "今月はお疲れ様でした！\nまた来月もよろしくお願いします。"}
            </p>
            <button
              onClick={() => setShowMonthlyThanks(false)}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition"
            >
              閉じる
            </button>
          </div>
          <style>{`
            @keyframes bow {
              0%, 100% { transform: rotate(0deg); transform-origin: bottom center; }
              30%, 70% { transform: rotate(15deg); transform-origin: bottom center; }
            }
          `}</style>
        </div>
      )}
      {/* 季節の挨拶モーダル */}
      {showSeasonal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 overflow-hidden" onClick={() => setShowSeasonal(false)}>
          {renderAnimation(seasonalAnimation)}
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center max-w-xs w-full shadow-2xl relative z-10" onClick={(e) => e.stopPropagation()}>
            {(seasonalImageUrl || monthlyAdmin) && (
              <div className="mb-4" style={{ animation: "bow 1.2s ease-in-out infinite" }}>
                {(() => {
                  const url = seasonalImageUrl || monthlyAdmin?.thankYouImageUrl || monthlyAdmin?.avatarUrl;
                  return url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url.startsWith("http") ? url : `/uploads/${url}`} alt="挨拶" className="w-24 h-24 rounded-full object-cover border-4 border-blue-100" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white border-4 border-blue-100">{monthlyAdmin?.name[0]?.toUpperCase()}</div>
                  );
                })()}
              </div>
            )}
            <p className="text-sm text-gray-700 mb-6 text-center whitespace-pre-line">{seasonalMsg}</p>
            <button onClick={() => setShowSeasonal(false)} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition">閉じる</button>
          </div>
        </div>
      )}
      {/* 月初サマリーモーダル */}
      {showSummary && summaryData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setShowSummary(false)}>
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center max-w-xs w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-4xl mb-3">📊</div>
            <p className="text-base font-bold text-gray-800 mb-1">{summaryData.label}の実績</p>
            <p className="text-3xl font-bold text-blue-600 mb-1">{summaryData.count}<span className="text-base font-normal text-gray-400 ml-1">件完了</span></p>
            <p className="text-xs text-gray-400 mb-4">お疲れ様でした！</p>
            {summaryData.breakdown.length > 1 && (
              <div className="w-full bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
                {summaryData.breakdown.map((b) => (
                  <div key={b.company} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate mr-2">{b.company}</span>
                    <span className="font-bold text-gray-800 shrink-0">{b.count}件</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowSummary(false)} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition">閉じる</button>
          </div>
        </div>
      )}
      {/* 完了通知バナー */}
      {completionNotice && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg px-5 py-3 flex items-center gap-3 max-w-sm w-[90vw] cursor-pointer"
          onClick={() => setCompletionNotice(null)}
        >
          <span className="text-green-500 text-lg">✓</span>
          <p className="text-sm text-gray-700 flex-1"><span className="font-medium">{completionNotice}</span>　依頼完了しました</p>
          <span className="text-gray-300 text-xs">✕</span>
        </div>
      )}
      <Header />
      {storageWarning && (
        <div className="bg-yellow-400 text-yellow-900 text-xs font-medium px-4 py-2 flex items-center justify-between">
          <span>⚠️ ストレージ残量が少なくなっています（{storageWarning}）— <a href="/settings" className="underline">設定で確認</a></span>
          <button onClick={() => setStorageWarning(null)} className="ml-4 text-yellow-800 hover:text-yellow-900">✕</button>
        </div>
      )}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">依頼一覧</h2>
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
                {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/calendar" className="text-sm text-gray-300 border border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-800 transition">
              📅 カレンダー
            </Link>
            {role === "ADMIN" && (
              <Link href="/projects/new" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition">
                ＋ 新規依頼
              </Link>
            )}
          </div>
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {(() => {
            const isRed = maxPerCompany >= 8;
            const isYellow = !isRed && maxPerCompany >= 5;
            return (
              <div className={`rounded-xl border px-3 py-2.5 text-center ${isRed ? "bg-red-50 border-red-300" : isYellow ? "bg-yellow-50 border-yellow-300" : "bg-white border-gray-200"}`}>
                <p className="text-xs text-gray-400 mb-0.5">進行中</p>
                <p className={`text-lg font-bold ${isRed ? "text-red-600" : isYellow ? "text-yellow-600" : "text-gray-800"}`}>{activeProjects.length}<span className="text-xs font-normal text-gray-400 ml-0.5">件</span></p>
              </div>
            );
          })()}
          <Link href="/billing" className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 text-center block hover:bg-gray-50 transition">
            <p className="text-xs text-gray-400 mb-0.5">完了済み</p>
            <p className="text-lg font-bold text-gray-800">{completedProjects.length}<span className="text-xs font-normal text-gray-400 ml-0.5">件</span></p>
          </Link>
          <div className={`rounded-xl border px-3 py-2.5 text-center ${unreadCount > 0 ? "bg-blue-50 border-blue-300" : "bg-white border-gray-200"}`}>
            <p className="text-xs text-gray-400 mb-0.5">未読</p>
            <p className={`text-lg font-bold ${unreadCount > 0 ? "text-blue-600" : "text-gray-800"}`}>{unreadCount}<span className="text-xs font-normal text-gray-400 ml-0.5">件</span></p>
          </div>
        </div>

        {/* 検索・フィルター */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 space-y-2">
          <div className="flex gap-2">
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 物件名・住所・依頼名で検索"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`text-xs px-3 py-2 rounded-lg border transition ${showFilters || filterStatus || filterUrgency || filterRegion || filterPartner ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
            >
              絞り込み
            </button>
          </div>
          {showFilters && (
            <div className="flex gap-2 flex-wrap pt-1">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">全ステータス</option>
                <option value="PENDING">依頼中</option>
                <option value="REWORK">再報告待ち</option>
                <option value="ACCEPTED">受注済</option>
                <option value="INSPECTED">完了報告済</option>
                <option value="CONFIRMED">確認済</option>
                <option value="QUOTE_REQUESTED">見積依頼中</option>
                <option value="QUOTE_REVIEWING">見積り中</option>
                <option value="COMPLETED">完了</option>
                <option value="REJECTED">差し戻し</option>
              </select>
              <select value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">全緊急度</option>
                <option value="HIGH">高</option>
                <option value="MEDIUM">中</option>
                <option value="LOW">低</option>
              </select>
              <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">全地域</option>
                <option value="栃木県">栃木県</option>
                <option value="茨城県">茨城県</option>
                <option value="群馬県">群馬県</option>
                <option value="埼玉県">埼玉県</option>
                <option value="東京都">東京都</option>
              </select>
              {role === "ADMIN" && (
                <select value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}
                  className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">全協力会社</option>
                  {partners.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              )}
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
                {[
                  { key: "visit", label: "訪問順" },
                  { key: "urgency", label: "緊急順" },
                  { key: "status", label: "状態順" },
                  { key: "region", label: "地域順" },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setSortMode(key as typeof sortMode)}
                    className={`px-2 py-1.5 transition ${sortMode === key ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {sortedActive.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>{search || filterStatus || filterUrgency || filterRegion ? "条件に一致する依頼がありません" : "進行中の依頼がありません"}</p>
          </div>
        ) : (
          <div className="space-y-3">{sortedActive.map(renderProject)}</div>
        )}

        {/* 差し戻しゾーン（管理者のみ） */}
        {role === "ADMIN" && rejectedProjects.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 px-4 py-3 bg-red-950 border border-red-800 rounded-xl text-sm text-red-300 mb-3">
              <span className="text-base">↩</span>
              <span className="font-medium">差し戻しゾーン</span>
              <span className="ml-1 text-red-500">（{rejectedProjects.length}件）</span>
              <span className="text-xs text-red-500 ml-1">— 協力会社が受けられなかった依頼</span>
            </div>
            <div className="space-y-3">{rejectedProjects.map(renderProject)}</div>
          </div>
        )}

      </main>
    </div>
  );
}
