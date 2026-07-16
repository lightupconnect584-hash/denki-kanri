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
  visitTime: string | null;
  region: string | null;
  contactRequired: boolean;
  contactedAt: string | null;
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
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
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

  const isUnread = (p: Project) => {
    const seen = seenMap[p.id];
    const notifyAt = role === "ADMIN" ? p.notifyAdminAt : p.notifyPartnerAt;
    if (!notifyAt) return false;
    if (!seen) return true;
    return notifyAt > seen;
  };

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const activeProjects = projects.filter((p) => !DONE_STATUSES.includes(p.status) && p.status !== "REJECTED" && !p.onHold);
  // 保留中（フィルター無視・全件から。古い順）
  const heldProjects = projects
    .filter((p) => p.onHold && !DONE_STATUSES.includes(p.status) && p.status !== "REJECTED")
    .sort((a, b) => new Date(a.holdAt || 0).getTime() - new Date(b.holdAt || 0).getTime());
  const holdDays = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0);
  // 完了済みは当月分のみ表示
  const completedProjects = projects
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
  const rejectedProjects = projects.filter((p) => p.status === "REJECTED");

  const sortedActive = [...activeProjects].sort((a, b) => {
    // 未読を常に上位
    const aU = isUnread(a) ? 0 : 1;
    const bU = isUnread(b) ? 0 : 1;
    if (aU !== bU) return aU - bU;
    const aV = a.visitDate ? new Date(a.visitDate).getTime() : null;
    const bV = b.visitDate ? new Date(b.visitDate).getTime() : null;
    if (aV && bV) return aV - bV;
    if (aV) return -1;
    if (bV) return 1;
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  });

  // 受付ボックスの取得（管理者）
  useEffect(() => {
    if (role === "ADMIN") fetchIntake();
  }, [role, fetchIntake]);

  // 要対応リスト（差し戻しも統合）
  const actionItems = [
    ...(role === "ADMIN"
      ? rejectedProjects.map((p) => ({ project: p, reason: { label: "差し戻し", color: "bg-red-100 text-red-700" } }))
      : []),
    ...projects
      .map((p) => ({ project: p, reason: actionReason(role, p) }))
      .filter((x): x is { project: Project; reason: NonNullable<ReturnType<typeof actionReason>> } => x.reason !== null),
  ];

  // 📅 今日の予定（訪問日が今日の進行中案件）
  const todayVisits = projects
    .filter((p) => {
      if (!p.visitDate || DONE_STATUSES.includes(p.status) || p.status === "REJECTED" || p.onHold) return false;
      const v = new Date(p.visitDate);
      const t = new Date();
      return v.getFullYear() === t.getFullYear() && v.getMonth() === t.getMonth() && v.getDate() === t.getDate();
    })
    .sort((a, b) => (a.visitTime || "99:99").localeCompare(b.visitTime || "99:99"));

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
          {/* バッジ行（該当時のみ。自社バッジは自社セクションに入っているので不要） */}
          {(p.urgency === "HIGH" || p.urgency === "MEDIUM" || p.materialSupplied || (p.contactRequired && !p.contactedAt)) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {p.contactRequired && !p.contactedAt && <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">📞 要アポ</span>}
              {p.urgency === "HIGH" && <span className="text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded-full font-medium">緊急</span>}
              {p.urgency === "MEDIUM" && <span className="text-xs bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded-full font-medium">中</span>}
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

        <div>
          {/* ===== メインエリア ===== */}
          <div>

            {/* 📅 今日の予定 */}
            {todayVisits.length > 0 && (
              <div className="mb-4 bg-blue-950/40 border border-blue-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-800/60">
                  <span className="text-base">📅</span>
                  <span className="text-sm font-bold text-blue-300">今日の予定</span>
                  <span className="text-xs text-blue-500">{todayVisits.length}件</span>
                </div>
                <div className="divide-y divide-blue-900/40">
                  {todayVisits.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-blue-900/30 transition"
                    >
                      <span className={`text-xs font-bold shrink-0 ${p.visitTime ? "text-blue-300" : "text-gray-500"}`}>{p.visitTime || "時間未定"}</span>
                      <span className="text-sm text-gray-200 truncate flex-1 min-w-0">{p.title}</span>
                      <span className="hidden sm:inline text-xs text-gray-500 truncate max-w-[160px] shrink-0">📍 {abbrevAddr(p.location)}</span>
                      {role === "ADMIN" && p.assignedTo && (
                        <span className="text-xs text-gray-500 truncate max-w-[90px] shrink-0">{p.assignedTo.companyName || p.assignedTo.name}</span>
                      )}
                      <span className="text-blue-500 text-xs shrink-0">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

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

            {/* ⚡要対応・⏸保留中（PCは左右2カラム / モバイルは上下） */}
            {(actionItems.length > 0 || heldProjects.length > 0) && (
            <div className="mb-4 space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
            {actionItems.length > 0 && (
              <div className="bg-amber-950/40 border border-amber-700 rounded-xl overflow-hidden">
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
              <div className="bg-orange-950/40 border border-orange-700 rounded-xl overflow-hidden">
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
            </div>
            )}

            {sortedActive.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p>進行中の依頼がありません</p>
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
                        {/* エリア別（埼玉 / 北関東 / 未分類）に分けて表示 */}
                        <div className="space-y-4">
                          {([["埼玉", "text-pink-300", "bg-pink-400"], ["北関東", "text-emerald-300", "bg-emerald-400"], ["", "text-gray-400", "bg-gray-500"]] as const).map(([reg, textCls, barCls]) => {
                            const group = selfActive.filter((p) => (p.region || "") === reg);
                            if (group.length === 0) return null;
                            return (
                              <div key={reg || "none"}>
                                <div className="flex items-center gap-1.5 mb-2">
                                  <span className={`w-2 h-2 rounded-full ${barCls}`} />
                                  <span className={`text-xs font-bold ${textCls}`}>{reg || "エリア未設定"}</span>
                                  <span className="text-xs text-gray-600">{group.length}件</span>
                                </div>
                                <div className="space-y-2.5 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-3">{group.map(renderProject)}</div>
                              </div>
                            );
                          })}
                        </div>
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

          </div>

        </div>
      </main>
    </div>
  );
}
