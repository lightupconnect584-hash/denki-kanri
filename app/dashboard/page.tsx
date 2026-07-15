"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import { actionReason } from "@/lib/actionRequired";

interface Project {
  id: string;
  title: string;
  location: string;
  workType: string | null;
  urgency: string;
  materialSupplied: boolean;
  status: string;
  amount: number | null;
  dueDate: string | null;
  visitDate: string | null;
  onHold: boolean;
  holdReason: string | null;
  holdAt: string | null;
  updatedAt: string;
  notifyAdminAt: string | null;
  notifyPartnerAt: string | null;
  assignedTo: { id: string; name: string; companyName: string | null; color: string | null } | null;
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
  const myId = (session?.user as { id?: string })?.id;

  // 📥 受付ボックス（依頼書のペーパーレス受付）
  const [intakeDocs, setIntakeDocs] = useState<{ id: string; filename: string; originalName: string; createdByName: string | null; createdAt: string }[]>([]);
  const [intakeUploading, setIntakeUploading] = useState(false);

  const fetchIntake = useCallback(async () => {
    try {
      const res = await fetch("/api/intake");
      if (res.ok) setIntakeDocs(await res.json());
    } catch { /* ignore */ }
  }, []);

  const [intakeDrag, setIntakeDrag] = useState(false);
  const [showIntakeMobile, setShowIntakeMobile] = useState(false); // モバイルで受付ボックスを開くか
  const [showHeldMobile, setShowHeldMobile] = useState(false); // モバイルで保留中を開くか

  const uploadIntakeFiles = useCallback(async (files: File[]) => {
    const targets = files.filter((f) => f.type === "application/pdf" || f.type.startsWith("image/") || f.name.toLowerCase().endsWith(".pdf"));
    if (targets.length === 0) return;
    setIntakeUploading(true);
    for (const file of targets) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        await fetch("/api/intake", { method: "POST", body: fd });
      } catch { /* ignore */ }
    }
    await fetchIntake();
    setIntakeUploading(false);
  }, [fetchIntake]);

  const handleIntakeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadIntakeFiles(Array.from(files));
    e.target.value = "";
  };

  // ページ全体でドロップ・貼り付けを受付（管理者のみ。入力欄フォーカス中の貼り付けは除外）
  useEffect(() => {
    if (role !== "ADMIN") return;
    const onOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIntakeDrag(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      const files: File[] = dt.files && dt.files.length > 0
        ? Array.from(dt.files)
        : Array.from(dt.items || []).filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter((f): f is File => !!f);
      if (files.length > 0) uploadIntakeFiles(files);
    };
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) setIntakeDrag(true);
    };
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === "file" && (it.type === "application/pdf" || it.type.startsWith("image/"))) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) { e.preventDefault(); uploadIntakeFiles(files); }
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("paste", onPaste);
    };
  }, [role, uploadIntakeFiles]);

  const deleteIntake = async (intakeId: string) => {
    if (!confirm("この受付を取り消しますか？")) return;
    await fetch("/api/intake", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: intakeId }),
    });
    fetchIntake();
  };

  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // パートナーの基本情報未入力チェック
  useEffect(() => {
    if (role !== "PARTNER") return;
    fetch("/api/auth/profile").then(r => r.json()).then(data => {
      const incomplete = !data.address || !data.birthDate || !data.bloodType || !data.emergencyName || !data.emergencyPhone;
      setProfileIncomplete(incomplete);
    }).catch(() => {});
  }, [role]);


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

  const activeProjects = filtered.filter((p) => !DONE_STATUSES.includes(p.status) && p.status !== "REJECTED" && !p.onHold);
  // 保留中（フィルター無視・全件から。古い順）
  const heldProjects = projects
    .filter((p) => p.onHold && !DONE_STATUSES.includes(p.status) && p.status !== "REJECTED")
    .sort((a, b) => new Date(a.holdAt || 0).getTime() - new Date(b.holdAt || 0).getTime());
  const holdDays = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0);
  const activePerCompany = activeProjects.reduce<Record<string, number>>((acc, p) => {
    const id = p.assignedTo?.id ?? "__none";
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});
  const maxPerCompany = Math.max(0, ...Object.values(activePerCompany));
  // 完了済みは当月分のみ表示
  const completedProjects = filtered
    .filter((p) => {
      if (!DONE_STATUSES.includes(p.status)) return false;
      const d = getWorkDate(p);
      if (!d) return false;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === currentMonthKey;
    })
    .sort((a, b) => {
      const aD = getWorkDate(a)?.getTime() ?? 0;
      const bD = getWorkDate(b)?.getTime() ?? 0;
      return aD - bD;
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

  // 受付ボックスの取得（管理者）
  useEffect(() => {
    if (role === "ADMIN") fetchIntake();
  }, [role, fetchIntake]);

  // 要対応リスト（フィルター無視・全件から抽出）
  const actionItems = projects
    .map((p) => ({ project: p, reason: actionReason(role, p) }))
    .filter((x): x is { project: Project; reason: NonNullable<ReturnType<typeof actionReason>> } => x.reason !== null);

  const getVisitBadge = (visitDate: string | null) => {
    if (!visitDate) return null;
    const visit = new Date(visitDate);
    const now = new Date();
    const diffDays = Math.ceil((new Date(visit).setHours(0,0,0,0) - new Date(now).setHours(0,0,0,0)) / 86400000);
    const dateStr = visit.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
    if (diffDays < 0) return null;
    if (diffDays === 0) return { text: `今日 ${dateStr}`, color: "bg-red-900/50 text-red-300 border border-red-700" };
    if (diffDays === 1) return { text: `明日 ${dateStr}`, color: "bg-orange-900/40 text-orange-300 border border-orange-700" };
    if (diffDays <= 3) return { text: dateStr, color: "bg-yellow-900/40 text-yellow-300 border border-yellow-700" };
    return { text: dateStr, color: "bg-blue-900/30 text-blue-400 border border-blue-800" };
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
    const partnerColor = p.assignedTo?.color;
    const isSelfJob = role === "ADMIN" && !!myId && p.assignedTo?.id === myId; // 自社施工
    return (
      <Link key={p.id} href={`/projects/${p.id}`}
        className={`relative block rounded-xl border transition overflow-hidden group
          ${unread
            ? "bg-gray-800 border-blue-400 border-l-4 shadow-blue-900/30 shadow-md"
            : "bg-gray-800/60 border-gray-700 hover:border-gray-500 hover:shadow-sm"
          }`}>
        {/* 担当者カラーバー（自社案件は白） */}
        {isSelfJob ? (
          <span className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl bg-white" />
        ) : partnerColor && (
          <span className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ backgroundColor: partnerColor }} />
        )}
        <div className="p-4">
          {/* タイトル行：タイトル＋ステータス */}
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-gray-100 break-words leading-snug flex-1 min-w-0">{p.title}</p>
            <div className="shrink-0"><StatusBadge status={p.status} /></div>
          </div>
          {/* バッジ行（該当時のみ） */}
          {(p.urgency === "HIGH" || p.urgency === "MEDIUM" || isSelfJob || p.materialSupplied) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {p.urgency === "HIGH" && <span className="text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded-full font-medium">緊急</span>}
              {p.urgency === "MEDIUM" && <span className="text-xs bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded-full font-medium">中</span>}
              {isSelfJob && <span className="text-xs bg-white/10 text-white border border-gray-400 px-1.5 py-0.5 rounded-full font-bold">🔧 自社</span>}
              {p.materialSupplied && <span className="text-xs bg-teal-900/50 text-teal-300 border border-teal-700 px-1.5 py-0.5 rounded-full font-medium">📦 材料支給</span>}
            </div>
          )}
          {/* 住所 */}
          <p className="text-sm text-gray-400 mt-2 truncate">📍 {p.location}</p>
          {/* メタ情報（依頼名・協力会社・訪問予定）を1行にまとめる */}
          {(p.workType || (role === "ADMIN" && p.assignedTo && !isSelfJob) || visitBadge) && (
            <div className="flex items-center gap-x-3 gap-y-1.5 mt-2 flex-wrap">
              {p.workType && (
                <span className="text-xs text-gray-400 font-medium">{p.workType}</span>
              )}
              {role === "ADMIN" && p.assignedTo && !isSelfJob && (
                <span className="text-xs flex items-center gap-1">
                  {partnerColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: partnerColor }} />}
                  <span className="text-gray-500">{p.assignedTo.companyName || p.assignedTo.name}</span>
                </span>
              )}
              {visitBadge && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visitBadge.color}`}>
                  {visitBadge.text}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
    );
  };

  if (status === "loading" || loading) {
    return <div className="min-h-full flex items-center justify-center"><p className="text-gray-500">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
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
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 sm:py-6">

        {/* タイトルバー */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white lg:text-xl">依頼一覧</h2>
            <button onClick={() => fetchProjects(true)} disabled={refreshing}
              className="text-gray-400 hover:text-blue-500 transition disabled:opacity-40" title="更新">
              <span className={`text-base ${refreshing ? "animate-spin inline-block" : ""}`}>🔄</span>
            </button>
            {lastUpdated && (
              <span className="hidden sm:inline text-xs text-gray-400">
                {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="text-xs text-blue-400 border border-blue-700 rounded-lg px-2 sm:px-3 py-1.5 hover:bg-blue-900/40 transition">
                全て既読
              </button>
            )}
{role === "ADMIN" && (
              <button
                onClick={() => setShowIntakeMobile((v) => !v)}
                className={`relative flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border font-medium transition ${showIntakeMobile || intakeDocs.length > 0 ? "bg-sky-600/20 text-sky-300 border-sky-600" : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500"}`}
                title="受付ボックス"
              >
                <span>📥</span>
                <span>受付</span>
                {intakeDocs.length > 0 && (
                  <span className="bg-sky-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">{intakeDocs.length}</span>
                )}
                <span className="text-xs text-gray-500">{showIntakeMobile ? "▲" : "▼"}</span>
              </button>
            )}
          </div>
        </div>

        {/* 基本情報未入力バナー（パートナー用） */}
        {role === "PARTNER" && profileIncomplete && (
          <Link href="/settings"
            className="flex items-center gap-3 bg-red-950/60 border border-red-700 rounded-xl px-4 py-3 mb-4 hover:bg-red-900/40 transition">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-300">基本情報の入力をお願いします</p>
              <p className="text-xs text-red-400 mt-0.5">住所・生年月日・血液型・緊急連絡先が未入力です。設定画面から入力してください。</p>
            </div>
            <span className="text-red-400 shrink-0 text-sm">→</span>
          </Link>
        )}

        {/* PC: 2カラム / モバイル: 1カラム */}
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:items-start">

          {/* ===== 左サイドバー ===== */}
          <div className="lg:sticky lg:top-4 space-y-3">

            {/* サマリー（PC：縦並び / モバイル：横並び） */}
            <div className="hidden lg:flex flex-col gap-2">
              {(() => {
                const isRed = maxPerCompany >= 8;
                const isYellow = !isRed && maxPerCompany >= 5;
                return (
                  <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${isRed ? "bg-red-900/40 border border-red-700" : isYellow ? "bg-yellow-900/40 border border-yellow-700" : "bg-gray-800 border border-gray-700"}`}>
                    <span className="text-sm text-gray-300">進行中</span>
                    <span className={`text-2xl font-bold ${isRed ? "text-red-400" : isYellow ? "text-yellow-400" : "text-white"}`}>{activeProjects.length}<span className="text-sm font-normal text-gray-400 ml-1">件</span></span>
                  </div>
                );
              })()}
              <Link href="/billing" className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between hover:border-blue-500 transition group">
                <span className="text-sm text-gray-300 group-hover:text-white transition">今月の完了</span>
                <span className="text-2xl font-bold text-white">{completedProjects.length}<span className="text-sm font-normal text-gray-400 ml-1">件</span></span>
              </Link>
              <div className={`rounded-xl px-4 py-3 flex items-center justify-between border ${unreadCount > 0 ? "bg-blue-900/40 border-blue-600" : "bg-gray-800 border-gray-700"}`}>
                <span className="text-sm text-gray-300">未読案件</span>
                <span className={`text-2xl font-bold ${unreadCount > 0 ? "text-blue-400" : "text-white"}`}>{unreadCount}<span className="text-sm font-normal text-gray-400 ml-1">件</span></span>
              </div>
            </div>

            {/* サマリー（モバイル：横2列＋メッセージ） */}
            <div className="grid grid-cols-2 gap-2 lg:hidden">
              {(() => {
                const isRed = maxPerCompany >= 8;
                const isYellow = !isRed && maxPerCompany >= 5;
                return (
                  <div className={`rounded-xl border px-3 py-3 text-center ${isRed ? "bg-red-900/40 border-red-700" : isYellow ? "bg-yellow-900/40 border-yellow-700" : "bg-gray-800 border-gray-700"}`}>
                    <p className="text-xs text-gray-400 mb-0.5">進行中</p>
                    <p className={`text-xl font-bold ${isRed ? "text-red-400" : isYellow ? "text-yellow-400" : "text-white"}`}>{activeProjects.length}<span className="text-xs font-normal text-gray-500 ml-0.5">件</span></p>
                  </div>
                );
              })()}
              <div className={`rounded-xl border px-3 py-3 text-center ${unreadCount > 0 ? "bg-blue-900/40 border-blue-600" : "bg-gray-800 border-gray-700"}`}>
                <p className="text-xs text-gray-400 mb-0.5">未読案件</p>
                <p className={`text-xl font-bold ${unreadCount > 0 ? "text-blue-400" : "text-white"}`}>{unreadCount}<span className="text-xs font-normal text-gray-500 ml-0.5">件</span></p>
              </div>
            </div>
            {/* 検索・フィルター：PC は常時展開、モバイルはアイコンボタン1つ */}
            {/* モバイル用トグルボタン */}
            <div className="lg:hidden">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`relative w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-xl border transition ${showFilters || search || filterStatus || filterUrgency || filterRegion || filterPartner ? "bg-blue-600/20 text-blue-300 border-blue-600" : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500"}`}
              >
                <span>🔍</span>
                <span className="text-xs">検索・絞込</span>
                {(search || filterStatus || filterUrgency || filterRegion || filterPartner) && (
                  <span className="absolute top-1.5 right-2 w-2 h-2 bg-blue-400 rounded-full" />
                )}
                <span className="text-xs text-gray-500 ml-auto">{showFilters ? "▲" : "▼"}</span>
              </button>
              {showFilters && (
                <div className="mt-2 bg-gray-800 rounded-xl border border-gray-700 p-3 space-y-2">
                  <input
                    autoFocus
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="物件名・住所・依頼名"
                    className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">全ステータス</option>
                    <option value="PENDING">依頼中</option>
                    <option value="REWORK">再報告待ち</option>
                    <option value="ACCEPTED">受注済</option>
                    <option value="INSPECTED">完了報告済</option>
                    <option value="QUOTE_REQUESTED">見積依頼中</option>
                    <option value="QUOTE_REVIEWING">見積り中</option>
                    <option value="REJECTED">差し戻し</option>
                  </select>
                  <div className="flex gap-2">
                    <select value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)}
                      className="flex-1 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">全緊急度</option>
                      <option value="HIGH">高</option>
                      <option value="MEDIUM">中</option>
                      <option value="LOW">低</option>
                    </select>
                    <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}
                      className="flex-1 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">全地域</option>
                      <option value="栃木県">栃木県</option>
                      <option value="茨城県">茨城県</option>
                      <option value="群馬県">群馬県</option>
                      <option value="埼玉県">埼玉県</option>
                      <option value="東京都">東京都</option>
                    </select>
                  </div>
                  {role === "ADMIN" && (
                    <select value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}
                      className="w-full border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">全協力会社</option>
                      {partners.map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">並び替え</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { key: "visit", label: "訪問日順" },
                        { key: "urgency", label: "緊急度順" },
                        { key: "status", label: "状態順" },
                        { key: "region", label: "地域順" },
                      ].map(({ key, label }) => (
                        <button key={key} onClick={() => setSortMode(key as typeof sortMode)}
                          className={`py-1.5 text-xs rounded-lg border transition font-medium ${sortMode === key ? "bg-blue-600 text-white border-blue-600" : "bg-gray-700 text-gray-300 border-gray-600 hover:border-blue-400"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(search || filterStatus || filterUrgency || filterRegion || filterPartner) && (
                    <button
                      onClick={() => { setSearch(""); setFilterStatus(""); setFilterUrgency(""); setFilterRegion(""); setFilterPartner(""); }}
                      className="w-full text-xs text-gray-500 hover:text-red-400 transition py-1"
                    >
                      ✕ フィルターをリセット
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* PC用（常時展開） */}
            <div className="hidden lg:block bg-gray-800 rounded-xl border border-gray-700 p-3 space-y-2">
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 物件名・住所・依頼名"
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="space-y-2">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">全ステータス</option>
                  <option value="PENDING">依頼中</option>
                  <option value="REWORK">再報告待ち</option>
                  <option value="ACCEPTED">受注済</option>
                  <option value="INSPECTED">完了報告済</option>
                  <option value="QUOTE_REQUESTED">見積依頼中</option>
                  <option value="QUOTE_REVIEWING">見積り中</option>
                  <option value="REJECTED">差し戻し</option>
                </select>
                <div className="flex gap-2">
                  <select value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)}
                    className="flex-1 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">全緊急度</option>
                    <option value="HIGH">高</option>
                    <option value="MEDIUM">中</option>
                    <option value="LOW">低</option>
                  </select>
                  <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}
                    className="flex-1 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">全地域</option>
                    <option value="栃木県">栃木県</option>
                    <option value="茨城県">茨城県</option>
                    <option value="群馬県">群馬県</option>
                    <option value="埼玉県">埼玉県</option>
                    <option value="東京都">東京都</option>
                  </select>
                </div>
                {role === "ADMIN" && (
                  <select value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}
                    className="w-full border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">全協力会社</option>
                    {partners.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">並び替え</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { key: "visit", label: "訪問日順" },
                        { key: "urgency", label: "緊急度順" },
                      { key: "status", label: "状態順" },
                      { key: "region", label: "地域順" },
                    ].map(({ key, label }) => (
                      <button key={key} onClick={() => setSortMode(key as typeof sortMode)}
                        className={`py-1.5 text-xs rounded-lg border transition font-medium ${sortMode === key ? "bg-blue-600 text-white border-blue-600" : "bg-gray-700 text-gray-300 border-gray-600 hover:border-blue-400"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>


          </div>

          {/* ===== 右メインエリア ===== */}
          <div className="mt-3 lg:mt-0">

            {/* 📥 受付ボックス（管理者のみ・右上ボタンで開閉） */}
            {role === "ADMIN" && (
              <div className={`mb-4 rounded-xl overflow-hidden border transition ${showIntakeMobile ? "block" : "hidden"} ${intakeDrag ? "bg-sky-900/60 border-sky-400 border-dashed border-2" : "bg-sky-950/40 border-sky-700"}`}>
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-sky-800/60">
                  <span className="text-base">📥</span>
                  <span className="text-sm font-bold text-sky-300">受付ボックス</span>
                  {intakeDocs.length > 0 && <span className="text-xs text-sky-500">{intakeDocs.length}件 未振り分け</span>}
                  <label className={`ml-auto text-xs rounded-lg px-3 py-1.5 cursor-pointer transition ${intakeUploading ? "bg-gray-700 text-gray-400" : "bg-sky-600 text-white hover:bg-sky-700"}`}>
                    {intakeUploading ? "受付中…" : "＋ 依頼書を受付"}
                    <input type="file" accept="application/pdf,image/*" multiple className="hidden" disabled={intakeUploading} onChange={handleIntakeUpload} />
                  </label>
                </div>
                {intakeDocs.length === 0 ? (
                  <p className="text-xs text-gray-500 px-4 py-2.5">{intakeDrag ? "📥 ここにドロップして受付" : "依頼書（PDF・写真）をドラッグ&ドロップ／貼り付け（⌘V）／ボタンで受付 → 振り分けで依頼を作成"}</p>
                ) : (
                  <div className="divide-y divide-sky-900/40">
                    {intakeDocs.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                        <a href={d.filename} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80">
                          <span className="shrink-0">📄</span>
                          <span className="text-sm text-gray-200 truncate">{d.originalName}</span>
                        </a>
                        <span className="text-xs text-gray-500 shrink-0">
                          {new Date(d.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })} {d.createdByName || ""}
                        </span>
                        <Link href={`/projects/new?intake=${d.id}`} className="text-xs bg-sky-600 text-white rounded px-2.5 py-1 hover:bg-sky-700 transition shrink-0">
                          振り分け
                        </Link>
                        <button onClick={() => deleteIntake(d.id)} className="text-gray-600 hover:text-red-400 text-xs shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* 依頼書なしで作る導線（自社案件・電話受けなど） */}
                <Link
                  href="/projects/new"
                  className="flex items-center justify-center gap-1.5 px-4 py-2 border-t border-sky-900/50 text-xs text-sky-400 hover:bg-sky-900/30 transition"
                >
                  <span>✎</span>
                  <span>依頼書なしで作成（自社案件・電話受けなど）</span>
                </Link>
              </div>
            )}

            {/* ⚡ 要対応ボックス */}
            {actionItems.length > 0 && (
              <div className="mb-4 bg-amber-950/40 border border-amber-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-800/60">
                  <span className="text-base">⚡</span>
                  <span className="text-sm font-bold text-amber-300">要対応</span>
                  <span className="text-xs text-amber-500">{actionItems.length}件</span>
                </div>
                <div className="divide-y divide-amber-900/40">
                  {actionItems.map(({ project: p, reason }) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-amber-900/30 transition"
                    >
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${reason.color}`}>
                        {reason.label}
                      </span>
                      <span className="text-sm text-gray-200 truncate flex-1 min-w-0">{p.title}</span>
                      {role === "ADMIN" && p.assignedTo && (
                        <span className="text-xs text-gray-500 truncate max-w-[90px] shrink-0">
                          {p.assignedTo.companyName || p.assignedTo.name}
                        </span>
                      )}
                      <span className="text-amber-600 text-xs shrink-0">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ⏸ 保留中ボックス（モバイルは折りたたみ） */}
            {heldProjects.length > 0 && (
              <div className="mb-4 bg-orange-950/40 border border-orange-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowHeldMobile((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-orange-800/60 lg:cursor-default"
                >
                  <span className="text-base">⏸</span>
                  <span className="text-sm font-bold text-orange-300">保留中</span>
                  <span className="text-xs text-orange-500">{heldProjects.length}件</span>
                  <span className="hidden lg:inline text-xs text-gray-500 ml-auto">連絡待ち・確認待ちの依頼</span>
                  <span className="lg:hidden text-xs text-orange-500 ml-auto">{showHeldMobile ? "▲" : "▼"}</span>
                </button>
                <div className={`divide-y divide-orange-900/40 ${showHeldMobile ? "block" : "hidden"} lg:block`}>
                  {heldProjects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-orange-900/30 transition"
                    >
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0 bg-orange-100 text-orange-700 truncate max-w-[140px]">
                        {p.holdReason || "保留"}
                      </span>
                      <span className="text-sm text-gray-200 truncate flex-1 min-w-0">{p.title}</span>
                      <span className={`text-xs shrink-0 font-medium ${holdDays(p.holdAt) >= 7 ? "text-red-400" : "text-orange-500"}`}>
                        {holdDays(p.holdAt)}日
                      </span>
                      {role === "ADMIN" && p.assignedTo && (
                        <span className="text-xs text-gray-500 truncate max-w-[90px] shrink-0">
                          {p.assignedTo.companyName || p.assignedTo.name}
                        </span>
                      )}
                      <span className="text-orange-600 text-xs shrink-0">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {sortedActive.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p>{search || filterStatus || filterUrgency || filterRegion ? "条件に一致する依頼がありません" : "進行中の依頼がありません"}</p>
              </div>
            ) : role === "ADMIN" ? (
              (() => {
                const selfActive = sortedActive.filter((p) => !!myId && p.assignedTo?.id === myId);
                const partnerActive = sortedActive.filter((p) => !(!!myId && p.assignedTo?.id === myId));
                return (
                  <div className="space-y-5">
                    {selfActive.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="w-1 h-4 bg-white rounded-full" />
                          <h3 className="text-sm font-bold text-white">🔧 自社案件</h3>
                          <span className="text-xs text-gray-500">（{selfActive.length}件）</span>
                        </div>
                        <div className="space-y-2.5 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-3">{selfActive.map(renderProject)}</div>
                      </div>
                    )}
                    {partnerActive.length > 0 && (
                      <div>
                        {selfActive.length > 0 && (
                          <div className="flex items-center gap-2 mb-2.5">
                            <span className="w-1 h-4 bg-blue-500 rounded-full" />
                            <h3 className="text-sm font-bold text-gray-200">🤝 協力会社案件</h3>
                            <span className="text-xs text-gray-500">（{partnerActive.length}件）</span>
                          </div>
                        )}
                        <div className="space-y-2.5 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-3">{partnerActive.map(renderProject)}</div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="space-y-2.5 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-3">{sortedActive.map(renderProject)}</div>
            )}

            {/* 差し戻しゾーン */}
            {role === "ADMIN" && rejectedProjects.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-2 px-4 py-3 bg-red-950 border border-red-800 rounded-xl text-sm text-red-300 mb-3">
                  <span className="text-base">↩</span>
                  <span className="font-medium">差し戻しゾーン</span>
                  <span className="ml-1 text-red-500">（{rejectedProjects.length}件）</span>
                </div>
                <div className="space-y-2.5">{rejectedProjects.map(renderProject)}</div>
              </div>
            )}

          </div>

        </div>
      </main>
    </div>
  );
}
