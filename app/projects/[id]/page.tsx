"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";

function renderWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s　]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer"
        className="underline text-blue-400 hover:text-blue-300 break-all">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
import Link from "next/link";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

interface Photo {
  id: string;
  filename: string;
  originalName: string;
  category: string;
}

interface Inspection {
  id: string;
  result: string;
  workDate: string;
  workDates: string[];
  notes: string | null;
  polishedReport: string | null;
  createdAt: string;
  inspector: { name: string; companyName: string | null };
  photos: Photo[];
}

interface Quote {
  id: string;
  amount: number | null;
  notes: string | null;
  filename: string | null;
  status: string;
  createdAt: string;
  submittedBy: { name: string; companyName: string | null };
}

interface ProjectPhoto {
  id: string;
  filename: string;
  originalName: string;
}


interface Comment {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  readAt: string | null;
  author: { name: string; companyName: string | null; role: string; avatarUrl: string | null };
  reactions: { emoji: string; userId: string }[];
}

interface ActivityLog {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  user: { name: string; role: string } | null;
}

interface Project {
  id: string;
  title: string;
  location: string;
  roomNumber: string | null;
  workType: string | null;
  contractorName: string | null;
  contractorPhone: string | null;
  smsAllowed: boolean;
  description: string | null;
  preferredContactAt: string | null;
  preferredVisitAt: string | null;
  moveInDate: string | null;
  receivedAt: string | null;
  parkingInfo: string | null;
  managerName: string | null;
  afterManagerName: string | null;
  urgency: string;
  materialSupplied: boolean;
  amount: number | null;
  salesAmount: number | null;
  materialCost: number | null;
  memo: string | null;
  partnerMemo: string | null;
  contactRequired: boolean;
  contactedAt: string | null;
  contactMethod: string | null;
  visitDate: string | null;
  visitTime: string | null;
  onHold: boolean;
  holdReason: string | null;
  holdAt: string | null;
  holdByName: string | null;
  status: string;
  dueDate: string | null;
  assignedTo: { id: string; name: string; companyName: string | null; email: string } | null;
  createdBy: { name: string; avatarUrl: string | null; phone: string | null; thankYouEnabled: boolean; thankYouImageUrl: string | null };
  projectPhotos: ProjectPhoto[];
  inspections: Inspection[];
  quotes: Quote[];
  comments: Comment[];
  activityLogs: ActivityLog[];
}

export default function ProjectDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [updating, setUpdating] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [visitInput, setVisitInput] = useState("");
  const [visitTimeFrom, setVisitTimeFrom] = useState("");
  // 30分刻みの時刻候補（"9:00", "9:30", ...）
  const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${Math.floor(i / 2)}:${i % 2 === 0 ? "00" : "30"}`);
  const fmtTime = (from: string, to: string) => (from && to ? `${from}〜${to}` : from ? `${from}〜` : null);
  const [visitTimeTo, setVisitTimeTo] = useState("");
  const [savingVisit, setSavingVisit] = useState(false);
  const [holdPanelOpen, setHoldPanelOpen] = useState(false);
  const [holdCustom, setHoldCustom] = useState("");
  const [savingHold, setSavingHold] = useState(false);
  const [memoInput, setMemoInput] = useState("");
  const [memoSaved, setMemoSaved] = useState(false);
  const [savingMemo, setSavingMemo] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const REACTION_EMOJIS = ["👍", "✅", "😄", "🙏", "💪"];
  const [showLog, setShowLog] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [polishingId, setPolishingId] = useState<string | null>(null);
  const [editingPolishId, setEditingPolishId] = useState<string | null>(null);
  const [polishText, setPolishText] = useState("");
  const [copiedPolishId, setCopiedPolishId] = useState<string | null>(null);
  const [polishWarnings, setPolishWarnings] = useState<Record<string, string[]>>({});

  // 完了報告をAIで積水向けに清書
  const generatePolish = async (inspectionId: string) => {
    setPolishingId(inspectionId);
    try {
      const res = await fetch(`/api/projects/${id}/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "清書に失敗しました");
        return;
      }
      const j = await res.json();
      setPolishWarnings((prev) => ({ ...prev, [inspectionId]: j.uncertainties || [] }));
      fetchProject();
    } finally {
      setPolishingId(null);
    }
  };

  const copyPolish = async (text: string, inspectionId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPolishId(inspectionId);
      setTimeout(() => setCopiedPolishId(null), 1500);
    } catch {
      alert("コピーに失敗しました");
    }
  };

  const savePolish = async (inspectionId: string) => {
    await fetch(`/api/projects/${id}/polish`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionId, text: polishText }),
    });
    setEditingPolishId(null);
    fetchProject();
  };

  const role = (session?.user as { role?: string })?.role;
  const userId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchProject = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (r.status === 404 || r.status === 403) {
          window.location.href = "/dashboard";
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.error) { window.location.href = "/dashboard"; return; }
        setProject(data);
        // 管理者は memo、協力会社は partnerMemo を編集
        if (!isRefresh) setMemoInput((role === "PARTNER" ? data.partnerMemo : data.memo) || "");
        // visitDateを日付のみ（YYYY-MM-DD）に変換してセット
        if (data.visitDate) {
          const d = new Date(data.visitDate);
          const pad = (n: number) => String(n).padStart(2, "0");
          setVisitInput(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        } else {
          setVisitInput("");
        }
        if (data.visitTime) {
          const m = data.visitTime.match(/^(\d+(?::\d+)?)(?:時)?〜(\d+(?::\d+)?)(?:時)?$/);
          const norm = (v: string) => (v.includes(":") ? v : `${v}:00`);
          if (m) { setVisitTimeFrom(norm(m[1])); setVisitTimeTo(m[2] ? norm(m[2]) : ""); }
          else { const m2 = data.visitTime.match(/^(\d+(?::\d+)?)/); if (m2) { setVisitTimeFrom(norm(m2[1])); setVisitTimeTo(""); } }
        } else {
          setVisitTimeFrom(""); setVisitTimeTo("");
        }
        setLoading(false);
        setRefreshing(false);
        setLastUpdated(new Date());
        // 既読としてlocalStorageに記録（閲覧した時刻を保存）
        try { localStorage.setItem(`proj-seen-${id}`, new Date().toISOString()); } catch {}
        // 相手のコメントを既読にする
        fetch(`/api/projects/${id}/comments`, { method: "PATCH" }).catch(() => {});
      });
  };

  useEffect(() => {
    if (status === "authenticated") fetchProject();
  }, [status, id]);

  // 30秒ごとに自動更新（コメント・ステータス変化を反映）
  useEffect(() => {
    if (status !== "authenticated") return;
    const timer = setInterval(() => fetchProject(true), 30000);
    return () => clearInterval(timer);
  }, [status, id]);

  const updateQuoteStatus = async (quoteId: string, newStatus: string) => {
    setUpdating(true);
    await fetch(`/api/projects/${id}/quote`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId, status: newStatus }),
    });
    fetchProject();
    setUpdating(false);
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/pdf`);
      if (!res.ok) {
        alert("PDFの作成に失敗しました");
        return;
      }
      const blob = await res.blob();
      const filename = `依頼書_${project?.workType || project?.title || "依頼"}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });
      // モバイル：共有シートで保存・共有（画面遷移しないので戻れなくなる問題を回避）
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") return; // ユーザーがキャンセル
        }
      }
      // PC等：新しいタブで開く
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      setPdfLoading(false);
    }
  };

  const deleteProject = async () => {
    if (!confirm("この依頼を削除しますか？この操作は取り消せません。")) return;
    setUpdating(true);
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    window.location.href = "/dashboard";
  };

  const changeStatus = async (newStatus: string) => {
    const labels: Record<string, string> = {
      QUOTE_REQUESTED: "見積依頼",
      QUOTE_REVIEWING: "見積り中（確認済）",
      COMPLETED: "完了",
      CONFIRMED: "確認・完了",
      ACCEPTED: "受注",
      REJECTED: "差し戻し",
      PENDING: "進行中に戻す",
      REWORK: "再報告要求",
    };
    if (!confirm(`ステータスを「${labels[newStatus] ?? newStatus}」に変更しますか？`)) return;
    setUpdating(true);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
    fetchProject();
    setUpdating(false);
  };

  // 完了済の案件を追加工事のため復活させる（受注状態に戻す）
  const reviveProject = async () => {
    if (!confirm("この案件を復活させますか？\n追加工事のため「受注済」に戻り、担当の協力会社に通知されます。\n（これまでの完了報告・写真はそのまま残ります）")) return;
    setUpdating(true);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACCEPTED" }),
    });
    router.refresh();
    fetchProject();
    setUpdating(false);
  };

  const startInspection = async () => {
    setUpdating(true);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INSPECTING" }),
    });
    fetchProject();
    setUpdating(false);
  };

  const sendComment = async () => {
    if (!commentText.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/projects/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `送信に失敗しました (${res.status})`);
        return;
      }
      setCommentText("");
      fetchProject();
    } catch {
      alert("送信に失敗しました。再度お試しください。");
    } finally {
      setSendingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    await fetch(`/api/projects/${id}/comments?commentId=${commentId}`, { method: "DELETE" });
    fetchProject();
    setDeletingCommentId(null);
  };

  const handleProjectPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploadingPhoto(true);
    setPhotoUploadError("");
    for (const file of Array.from(files)) {
      try {
        let uploadFile = file;
        // 画像の場合は圧縮
        if (file.type.startsWith("image/")) {
          uploadFile = await new Promise<File>((resolve) => {
            const img = new window.Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
              const MAX = 1600;
              let w = img.width, h = img.height;
              if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
              const canvas = document.createElement("canvas");
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext("2d");
              if (!ctx) { resolve(file); return; }
              ctx.drawImage(img, 0, 0, w, h);
              canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                if (!blob) { resolve(file); return; }
                resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
              }, "image/jpeg", 0.7);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
          });
        }
        const formData = new FormData();
        formData.append("file", uploadFile);
        const res = await fetch(`/api/projects/${id}/photos`, { method: "POST", body: formData });
        if (!res.ok) setPhotoUploadError(`アップロード失敗 (${file.name})`);
      } catch {
        setPhotoUploadError(`エラーが発生しました (${file.name})`);
      }
    }
    fetchProject();
    setUploadingPhoto(false);
    e.target.value = "";
  };

  const handleDeleteProjectPhoto = async (photoId: string) => {
    if (!confirm("この写真/ファイルを削除しますか？")) return;
    setDeletingPhotoId(photoId);
    await fetch(`/api/projects/${id}/photos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId }),
    });
    fetchProject();
    setDeletingPhotoId(null);
  };

  const toggleReaction = async (commentId: string, emoji: string) => {
    if (!userId) return;
    setReactionPickerId(null);
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        comments: prev.comments.map((c) => {
          if (c.id !== commentId) return c;
          const exists = c.reactions.some((r) => r.emoji === emoji && r.userId === userId);
          const reactions = exists
            ? c.reactions.filter((r) => !(r.emoji === emoji && r.userId === userId))
            : [...c.reactions, { emoji, userId }];
          return { ...c, reactions };
        }),
      };
    });
    await fetch(`/api/projects/${id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId, emoji }),
    });
  };

  // 保留の設定/解除
  const setHold = async (onHold: boolean, reason?: string) => {
    setSavingHold(true);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onHold, holdReason: reason || "" }),
    });
    setHoldPanelOpen(false);
    setHoldCustom("");
    fetchProject();
    setSavingHold(false);
  };

  const [savingContact, setSavingContact] = useState(false);
  const setContacted = async (contacted: boolean) => {
    setSavingContact(true);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacted }),
    });
    fetchProject();
    setSavingContact(false);
  };

  const [loggingAttempt, setLoggingAttempt] = useState<string | null>(null);
  const [apptPanelOpen, setApptPanelOpen] = useState(false);
  const [apptDate, setApptDate] = useState("");
  const [apptFrom, setApptFrom] = useState("");
  const [apptTo, setApptTo] = useState("");

  // アポ取得＋訪問日を一度に登録
  const confirmAppointment = async (withDate: boolean) => {
    setSavingContact(true);
    const payload: Record<string, unknown> = { contacted: true };
    if (withDate && apptDate) {
      payload.visitDate = new Date(`${apptDate}T09:00:00`).toISOString();
      payload.visitTime = fmtTime(apptFrom, apptTo);
    }
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setApptPanelOpen(false);
    fetchProject();
    setSavingContact(false);
  };
  const logAttempt = async (label: string) => {
    setLoggingAttempt(label);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactAttempt: label }),
    });
    await new Promise((r) => setTimeout(r, 100));
    fetchProject(true);
    setLoggingAttempt(null);
  };

  // 共用部：完了後メモ投函予定として記録（不出ログがある場合のみ選択可）
  const confirmNotePlan = async () => {
    if (!confirm("共用部不具合のため「完了後メモ投函予定」として記録しますか？\nアポ取りの要対応表示が消えます。")) return;
    setSavingContact(true);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacted: true, contactMethod: "note" }),
    });
    fetchProject();
    setSavingContact(false);
  };

  const saveMemo = async () => {
    setSavingMemo(true);
    const field = role === "PARTNER" ? "partnerMemo" : "memo";
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: memoInput }),
    });
    setSavingMemo(false);
    setMemoSaved(true);
    setTimeout(() => setMemoSaved(false), 2000);
  };

  const saveVisitDate = async () => {
    setSavingVisit(true);
    const dateToSave = visitInput ? new Date(`${visitInput}T09:00:00`).toISOString() : null;
    const visitTime = fmtTime(visitTimeFrom, visitTimeTo);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitDate: dateToSave, visitTime }),
    });
    fetchProject();
    setSavingVisit(false);
  };

  if (loading || !project) {
    return (
      <div className="min-h-full flex items-center justify-center bg-gray-900">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  const isAssigned = project.assignedTo?.id === userId;
  // 担当者（協力会社、または自分担当の管理者）は報告・受注操作が可能
  const canInspect = isAssigned && (role === "PARTNER" || role === "ADMIN");
  const isSelfJob = role === "ADMIN" && isAssigned; // 自社施工案件

  // 訪問予定日のラベル
  const getVisitLabel = (dateStr: string | null) => {
    if (!dateStr) return null;
    const visit = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((visit.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / 86400000);
    if (diffDays < 0) return { text: "訪問済み", color: "bg-gray-700 text-gray-400" };
    if (diffDays === 0) return { text: "今日", color: "bg-red-900/50 text-red-300" };
    if (diffDays === 1) return { text: "明日", color: "bg-orange-900/40 text-orange-300" };
    if (diffDays <= 3) return { text: `${diffDays}日後`, color: "bg-yellow-900/40 text-yellow-300" };
    return { text: `${diffDays}日後`, color: "bg-blue-900/30 text-blue-400" };
  };

  const visitLabel = getVisitLabel(project.visitDate);

  return (
    <div className="min-h-full flex flex-col bg-gray-900 [color-scheme:dark]">
      <Header />
      <main className="flex-1 max-w-2xl lg:max-w-6xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-lg">
            ←
          </button>
          <button
            onClick={() => fetchProject(true)}
            disabled={refreshing}
            className="text-gray-500 hover:text-blue-400 transition disabled:opacity-40 shrink-0 ml-auto"
            title="更新"
          >
            <span className={`text-base ${refreshing ? "animate-spin inline-block" : ""}`}>🔄</span>
          </button>
          <StatusBadge status={project.status} />
          <button
            onClick={downloadPdf}
            disabled={pdfLoading}
            className="text-xs text-gray-300 hover:text-gray-100 border border-gray-600 rounded px-2 py-1 disabled:opacity-50"
            title="依頼書をPDFで保存"
          >
            {pdfLoading ? "⏳ 作成中..." : "📄 依頼書"}
          </button>
          {role === "ADMIN" && (
            <div className="flex gap-2">
              <Link
                href={`/projects/${id}/edit`}
                className="text-xs text-blue-400 hover:text-blue-300 border border-blue-700 rounded px-2 py-1"
              >
                編集
              </Link>
              <button
                onClick={deleteProject}
                disabled={updating}
                className="text-xs text-red-500 hover:text-red-300 border border-red-700 rounded px-2 py-1 disabled:opacity-50"
              >
                削除
              </button>
            </div>
          )}
        </div>

        {/* 📞 入居者立ち会い・要連絡バナー */}
        {project.contactRequired && !["CONFIRMED", "COMPLETED", "REJECTED"].includes(project.status) && (
          !project.contactedAt ? (
            <div className="mb-4 bg-red-950/50 border border-red-700 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">📞</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-red-300">入居者とのアポイントが必要な案件です</p>
                  <p className="text-xs text-red-400 mt-0.5">
                    入居者（折り返し先）に連絡して訪問日程のアポイントを取ってください。アポが取れたら下のボタンを押すと表示が消えます
                  </p>
                  {project.contractorPhone && (
                    <div className="flex gap-2 flex-wrap mt-2">
                      <a href={`tel:${project.contractorPhone}`}
                        className="inline-flex items-center gap-1.5 text-sm text-red-200 bg-red-900/50 border border-red-700 rounded-lg px-3 py-1.5 hover:bg-red-900 transition">
                        📞 {project.contractorName ? `${project.contractorName} ` : ""}{project.contractorPhone}
                      </a>
                      {project.smsAllowed && (
                        <a href={`sms:${project.contractorPhone}`}
                          className="inline-flex items-center gap-1.5 text-sm text-blue-200 bg-blue-900/50 border border-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-900 transition">
                          💬 SMSで連絡（可）
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* 連絡結果の記録（ワンタップでログ） */}
              {(role === "ADMIN" || isAssigned) && (
                <div className="mt-3">
                  <p className="text-xs text-red-400 mb-1.5">連絡した結果を記録：</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {["☎ 不出・留守電吹き込み済", "☎ 不出・留守電なし", ...(project.smsAllowed ? ["💬 SMS送信済"] : [])].map((label) => (
                      <button key={label}
                        onClick={() => logAttempt(label)}
                        disabled={loggingAttempt !== null}
                        className="text-xs bg-gray-800 text-gray-200 border border-gray-600 rounded-lg py-2 px-2 hover:border-red-500 hover:text-red-300 disabled:opacity-50 transition">
                        {loggingAttempt === label ? "記録中…" : label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* 連絡履歴 */}
              {project.activityLogs.filter((l) => l.action === "CONTACT_ATTEMPT").length > 0 && (
                <div className="mt-3 bg-gray-900/60 border border-red-900/50 rounded-lg divide-y divide-gray-800">
                  {project.activityLogs.filter((l) => l.action === "CONTACT_ATTEMPT").map((l) => (
                    <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <span className="text-gray-500 shrink-0">
                        {new Date(l.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-gray-200 flex-1 min-w-0 truncate">{l.detail}</span>
                      {l.user && <span className="text-gray-600 shrink-0">{l.user.name}</span>}
                    </div>
                  ))}
                </div>
              )}
              {(role === "ADMIN" || isAssigned) && (
                !apptPanelOpen ? (
                  <>
                  <button
                    onClick={() => setApptPanelOpen(true)}
                    className="mt-3 w-full bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-700 transition"
                  >
                    ✓ アポイントが取れた
                  </button>
                  {(() => {
                    const hasNoAnswer = project.activityLogs.some(
                      (l) => l.action === "CONTACT_ATTEMPT" && (l.detail || "").includes("不出")
                    );
                    return (
                      <div className="mt-2">
                        <button
                          onClick={confirmNotePlan}
                          disabled={savingContact || !hasNoAnswer}
                          className={`w-full rounded-xl py-2 text-xs font-medium border transition ${
                            hasNoAnswer
                              ? "bg-gray-800 text-amber-300 border-amber-700 hover:bg-amber-900/30"
                              : "bg-gray-800/50 text-gray-600 border-gray-700 cursor-not-allowed"
                          }`}
                        >
                          📮 共用部のため「完了後メモ投函予定」にする
                        </button>
                        {!hasNoAnswer && (
                          <p className="text-xs text-gray-600 mt-1 text-center">※ 一度電話して「不出」を記録すると選べます</p>
                        )}
                      </div>
                    );
                  })()}
                  </>
                ) : (
                  <div className="mt-3 bg-gray-800 border border-green-700 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-green-300">📅 決まった訪問日をそのまま登録できます</p>
                    <input
                      type="date"
                      value={apptDate}
                      onChange={(e) => setApptDate(e.target.value)}
                      className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 [color-scheme:dark]"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0">時間帯</span>
                      <select value={apptFrom} onChange={(e) => setApptFrom(e.target.value)}
                        className="border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 bg-gray-700 focus:outline-none">
                        <option value="">--</option>
                        {HALF_HOURS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="text-gray-500">〜</span>
                      <select value={apptTo} onChange={(e) => setApptTo(e.target.value)}
                        className="border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 bg-gray-700 focus:outline-none">
                        <option value="">--</option>
                        {HALF_HOURS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => confirmAppointment(true)}
                      disabled={savingContact || !apptDate}
                      className="w-full bg-green-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-green-700 disabled:opacity-40 transition"
                    >
                      {savingContact ? "登録中…" : "✓ アポ取得・訪問日を登録"}
                    </button>
                    <div className="flex items-center justify-between">
                      <button onClick={() => setApptPanelOpen(false)} className="text-xs text-gray-500 hover:text-gray-300">キャンセル</button>
                      <button
                        onClick={() => confirmAppointment(false)}
                        disabled={savingContact}
                        className="text-xs text-gray-400 hover:text-green-300 underline"
                      >
                        日程は後で入れる（アポ取得だけ記録）
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-2 bg-green-950/40 border border-green-800 rounded-xl px-4 py-2.5">
              <span className="text-sm text-green-300">
                {project.contactMethod === "note" ? "📮 完了後メモ投函予定（共用部）" : "✓ アポイント済み"}（{new Date(project.contactedAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}）
              </span>
              {(role === "ADMIN" || isAssigned) && (
                <button onClick={() => setContacted(false)} disabled={savingContact}
                  className="ml-auto text-xs text-gray-500 hover:text-red-400 transition">
                  取り消す
                </button>
              )}
            </div>
          )
        )}

        {/* 保留バナー・保留操作（管理者・担当協力会社） */}
        {project.onHold ? (
          <div className="mb-4 bg-orange-950/50 border-2 border-orange-600 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-bold text-orange-300">
                  ⏸ 保留中
                  {project.holdAt && (
                    <span className="ml-2 text-xs font-medium text-orange-400">
                      {Math.floor((Date.now() - new Date(project.holdAt).getTime()) / 86400000)}日経過
                    </span>
                  )}
                </p>
                <p className="text-sm text-orange-200 mt-1">{project.holdReason || "（理由未記入）"}</p>
                {project.holdByName && (
                  <p className="text-xs text-orange-500 mt-0.5">{project.holdByName} が保留にしました</p>
                )}
              </div>
              {(role === "ADMIN" || isAssigned) && (
                <button
                  onClick={() => setHold(false)}
                  disabled={savingHold}
                  className="bg-orange-600 text-white text-sm rounded-lg px-4 py-2 font-medium hover:bg-orange-700 disabled:opacity-50 transition shrink-0"
                >
                  {savingHold ? "…" : "▶ 保留を解除して再開"}
                </button>
              )}
            </div>
          </div>
        ) : (role === "ADMIN" || isAssigned) && !["CONFIRMED", "COMPLETED", "REJECTED"].includes(project.status) ? (
          <div className="mb-4">
            {!holdPanelOpen ? (
              <button
                onClick={() => setHoldPanelOpen(true)}
                className="w-full text-left text-xs text-gray-400 border border-gray-700 rounded-lg px-3 py-2 hover:border-orange-600 hover:text-orange-300 transition"
              >
                ⏸ 連絡が取れない・確認待ちのときは → この依頼を保留にする
              </button>
            ) : (
              <div className="bg-gray-800 border border-orange-700 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-orange-300">⏸ 保留の理由を選んでください</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {["入居者と連絡が取れない", "確認事項あり", "部品・手配待ち"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setHold(true, r)}
                      disabled={savingHold}
                      className="text-sm bg-gray-700 text-gray-200 border border-gray-600 rounded-lg py-2 px-2 hover:border-orange-500 hover:text-orange-300 disabled:opacity-50 transition"
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={holdCustom}
                    onChange={(e) => setHoldCustom(e.target.value)}
                    placeholder="その他の理由を入力"
                    className="flex-1 min-w-0 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => holdCustom.trim() && setHold(true, holdCustom.trim())}
                    disabled={savingHold || !holdCustom.trim()}
                    className="bg-orange-600 text-white text-sm rounded-lg px-4 py-2 hover:bg-orange-700 disabled:opacity-40 transition shrink-0"
                  >
                    保留にする
                  </button>
                </div>
                <button onClick={() => setHoldPanelOpen(false)} className="text-xs text-gray-500 hover:text-gray-300">キャンセル</button>
              </div>
            )}
          </div>
        ) : null}

        {/* PC: 左=情報 / 右=チャット の2カラム。モバイルは従来順のまま */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6 lg:items-start">
        <div className="min-w-0">
        {/* 基本情報 */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-3 space-y-3">
          <div>
            <h2 className="text-base font-bold text-gray-100 leading-snug">{project.title}</h2>
            {project.materialSupplied && (
              <span className="inline-block mt-1.5 text-xs bg-teal-900/40 text-teal-300 border border-teal-700 px-2 py-0.5 rounded-full font-bold">
                📦 材料支給あり
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400">住所</p>
            <p className="text-sm font-medium text-gray-100">📍 {project.location}{project.roomNumber ? `　${project.roomNumber}` : ""}</p>
          </div>
          {project.receivedAt && (
            <div>
              <p className="text-xs text-gray-400">受付日時</p>
              <p className="text-sm text-gray-200">{project.receivedAt}</p>
            </div>
          )}
          {role === "ADMIN" && (project.managerName || project.afterManagerName) && (
            <div className="flex gap-6 flex-wrap">
              {project.managerName && (
                <div>
                  <p className="text-xs text-gray-400">管理担当 <span className="text-gray-600">🔒</span></p>
                  <p className="text-sm text-gray-200">{project.managerName}</p>
                </div>
              )}
              {project.afterManagerName && (
                <div>
                  <p className="text-xs text-gray-400">アフター担当 <span className="text-gray-600">🔒</span></p>
                  <p className="text-sm text-gray-200">{project.afterManagerName}</p>
                </div>
              )}
            </div>
          )}
          {project.preferredContactAt && (
            <div>
              <p className="text-xs text-gray-400">連絡希望日時</p>
              <p className="text-sm text-gray-200">{project.preferredContactAt}</p>
            </div>
          )}
          {project.preferredVisitAt && (
            <div>
              <p className="text-xs text-gray-400">訪問希望日時</p>
              <p className="text-sm text-gray-200">{project.preferredVisitAt}</p>
            </div>
          )}
          {project.moveInDate && (
            <div>
              <p className="text-xs text-gray-400">入居開始日</p>
              <p className="text-sm text-gray-200">{project.moveInDate}</p>
            </div>
          )}
          {project.contractorName && (
            <div>
              <p className="text-xs text-gray-400">折り返し先名カナ</p>
              <p className="text-sm text-gray-200">{project.contractorName}</p>
            </div>
          )}
          {project.contractorPhone && (
            <div>
              <p className="text-xs text-gray-400">折り返し先電話番号</p>
              <div className="flex items-center gap-3 flex-wrap">
                <a
                  href={`tel:${project.contractorPhone.replace(/[^0-9+]/g, "")}`}
                  className="text-sm font-medium text-blue-400 hover:underline whitespace-nowrap"
                >
                  📞 {project.contractorPhone}
                </a>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  project.smsAllowed ? "bg-blue-900/50 text-blue-300" : "bg-gray-700 text-gray-400"
                }`}>
                  SMS {project.smsAllowed ? "可" : "不可"}
                </span>
              </div>
            </div>
          )}
          {project.workType && (
            <div>
              <p className="text-xs text-gray-400">依頼名</p>
              <p className="text-sm text-gray-200 font-medium">{project.workType}</p>
            </div>
          )}
          {project.description && (
            <div>
              <p className="text-xs text-gray-400">依頼内容</p>
              <p className="text-sm text-gray-200 whitespace-pre-wrap break-words overflow-hidden">{project.description}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">緊急度</p>
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
              project.urgency === "HIGH"
                ? "bg-red-900/40 text-red-300"
                : project.urgency === "MEDIUM"
                ? "bg-yellow-900/40 text-yellow-300"
                : "bg-green-900/40 text-green-300"
            }`}>
              {project.urgency === "HIGH" ? "高" : project.urgency === "MEDIUM" ? "中" : "低"}
            </span>
          </div>
          {project.amount != null && !isSelfJob && (
            <div>
              <p className="text-xs text-gray-400">金額【税別】</p>
              {(() => {
                const changes = project.activityLogs.filter((l) => l.action === "AMOUNT_CHANGED");
                const prevAmounts = changes
                  .map((l) => l.detail?.split(" → ")[0])
                  .filter((s): s is string => !!s && s !== "未設定")
                  .filter((s, i, arr) => arr.indexOf(s) === i);
                const hasChange = changes.length > 0;
                return (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {prevAmounts.map((s) => (
                      <span key={s} className="text-sm text-gray-500 line-through">{s}</span>
                    ))}
                    <span className={`text-sm font-medium ${hasChange ? "text-orange-300" : "text-gray-100"}`}>
                      ¥{project.amount.toLocaleString()}
                    </span>
                    {hasChange && (
                      <span className="text-xs text-orange-500 bg-orange-900/30 border border-orange-800 px-1.5 py-0.5 rounded">変更済</span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          {role === "ADMIN" && (project.salesAmount != null || project.materialCost != null) && (
            <div className="flex gap-6 flex-wrap">
              {project.salesAmount != null && (
                <div>
                  <p className="text-xs text-gray-400">売上（積水請求・税別）<span className="ml-1">🔒</span></p>
                  <p className="text-sm font-medium text-gray-100">¥{project.salesAmount.toLocaleString()}</p>
                </div>
              )}
              {project.materialCost != null && (
                <div>
                  <p className="text-xs text-gray-400">材料費（税別）<span className="ml-1">🔒</span></p>
                  <p className="text-sm font-medium text-gray-100">¥{project.materialCost.toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
          {project.parkingInfo && (
            <div>
              <p className="text-xs text-gray-400">駐車場空き区画</p>
              <p className="text-sm text-gray-200">🅿️ {project.parkingInfo}</p>
            </div>
          )}
          {project.assignedTo && (
            <div>
              <p className="text-xs text-gray-400">担当協力会社</p>
              <p className="text-sm text-gray-200">
                {project.assignedTo.companyName || project.assignedTo.name}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">依頼者</p>
            <div className="flex items-center gap-2 mt-1">
              {project.createdBy.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={project.createdBy.avatarUrl.startsWith("http") ? project.createdBy.avatarUrl : `/uploads/${project.createdBy.avatarUrl}`}
                  alt={project.createdBy.name}
                  className="w-6 h-6 rounded-full object-cover border border-gray-700"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-400 border border-gray-700">
                  {project.createdBy.name[0]?.toUpperCase()}
                </div>
              )}
              <p className="text-sm text-gray-200">{project.createdBy.name}</p>
            </div>
          </div>
        </div>

        {/* 訪問予定日 */}
        {!(role === "PARTNER" && ["QUOTE_REQUESTED", "QUOTE_REVIEWING"].includes(project.status)) && (
        <div className={`rounded-xl border p-5 mb-4 ${!project.visitDate && isAssigned && ["PENDING", "ACCEPTED", "REWORK"].includes(project.status) ? "bg-amber-900/30 border-amber-700" : "bg-gray-800 border-gray-700"}`}>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-gray-100">📅 訪問予定日</h3>
            {!project.visitDate && isAssigned && ["PENDING", "ACCEPTED", "REWORK"].includes(project.status) && (
              <span className="text-xs bg-amber-900/40 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-full font-medium">未設定</span>
            )}
          </div>
          {!project.visitDate && isAssigned && ["PENDING", "ACCEPTED", "REWORK"].includes(project.status) && (
            <p className="text-xs text-amber-300 mb-3">作業日が決まったら設定してください。管理者が日程を把握するために使います。</p>
          )}
          {project.visitDate && visitLabel && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <p className="text-sm font-medium text-gray-100">
                {new Date(project.visitDate).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
              </p>
              {project.visitTime && (
                <span className="text-sm font-medium text-blue-300">{project.visitTime}</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visitLabel.color}`}>
                {visitLabel.text}
              </span>
            </div>
          )}
          {!project.visitDate && !(isAssigned && ["PENDING", "ACCEPTED", "REWORK"].includes(project.status)) && (
            <p className="text-sm text-gray-500 mb-3">未設定</p>
          )}
          {/* 担当協力会社のみ・PENDING or ACCEPTED中は編集可 */}
          {isAssigned && ["PENDING", "ACCEPTED", "REWORK"].includes(project.status) ? (
            <>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={visitInput}
                  onChange={(e) => setVisitInput(e.target.value)}
                  className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                />
                <button
                  onClick={saveVisitDate}
                  disabled={savingVisit}
                  className="bg-blue-600 text-white text-sm px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
                >
                  {savingVisit ? "保存中" : "保存"}
                </button>
                {project.visitDate && (
                  <button
                    onClick={() => { setVisitInput(""); setVisitTimeFrom(""); setVisitTimeTo(""); }}
                    className="text-gray-400 hover:text-red-400 text-sm px-2"
                    title="クリア"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-400 shrink-0">時間帯</span>
                <select
                  value={visitTimeFrom}
                  onChange={(e) => setVisitTimeFrom(e.target.value)}
                  className="border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">--</option>
                  {HALF_HOURS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="text-gray-500">〜</span>
                <select
                  value={visitTimeTo}
                  onChange={(e) => setVisitTimeTo(e.target.value)}
                  className="border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">--</option>
                  {HALF_HOURS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {(visitTimeFrom || visitTimeTo) && (
                  <span className="text-xs text-blue-300 font-medium">
                    {fmtTime(visitTimeFrom, visitTimeTo) || ""}
                  </span>
                )}
              </div>
            </>
          ) : isAssigned && !["PENDING", "ACCEPTED"].includes(project.status) ? (
            <p className="text-xs text-gray-400 bg-gray-700/40 rounded-lg px-3 py-2">
              🔒 完了報告後は訪問予定日を変更できません
            </p>
          ) : null}
        </div>
        )}

        {/* 現場写真・PDF */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-100">現場写真・PDF</h3>
            <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition ${uploadingPhoto ? "bg-gray-700 text-gray-500 border-gray-700" : "bg-blue-900/40 text-blue-400 border-blue-700 hover:bg-blue-900/50"}`}>
              <span>{uploadingPhoto ? "アップロード中..." : "＋ 追加"}</span>
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                disabled={uploadingPhoto}
                onChange={handleProjectPhotoUpload}
              />
            </label>
          </div>
          {photoUploadError && <p className="text-xs text-red-500 mb-2">{photoUploadError}</p>}
          {project.projectPhotos && project.projectPhotos.length > 0 ? (
            (() => {
              const images = project.projectPhotos.filter((f) => !f.originalName.toLowerCase().endsWith(".pdf"));
              const pdfs = project.projectPhotos.filter((f) => f.originalName.toLowerCase().endsWith(".pdf"));
              return (
                <>
                  {images.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {images.map((photo) => {
                        const url = photo.filename.startsWith("http") ? photo.filename : `/uploads/${photo.filename}`;
                        return (
                          <div key={photo.id} className="relative group">
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={photo.originalName}
                                className="w-full h-24 object-cover rounded-lg border border-gray-700 hover:opacity-80 transition"
                              />
                            </a>
                            {role === "ADMIN" && (
                              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                <a
                                  href={url}
                                  download={photo.originalName}
                                  className="bg-blue-600 text-white text-xs rounded px-1.5 py-0.5 hover:bg-blue-700"
                                >↓</a>
                                <button
                                  onClick={() => handleDeleteProjectPhoto(photo.id)}
                                  disabled={deletingPhotoId === photo.id}
                                  className="bg-red-900/300 text-white text-xs rounded px-1.5 py-0.5 hover:bg-red-600 disabled:opacity-50"
                                >×</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {pdfs.length > 0 && (
                    <div className="space-y-2">
                      {pdfs.map((pdf) => {
                        const url = pdf.filename.startsWith("http") ? pdf.filename : `/uploads/${pdf.filename}`;
                        return (
                          <div key={pdf.id} className="flex items-center justify-between bg-gray-700/40 border border-gray-700 rounded-lg px-3 py-2">
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-blue-400 hover:underline flex items-center gap-2 min-w-0">
                              <span className="shrink-0">📄</span>
                              <span className="truncate">{pdf.originalName}</span>
                            </a>
                            {role === "ADMIN" && (
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <a href={url} download={pdf.originalName}
                                  className="text-xs text-green-400 border border-green-700 rounded px-2 py-0.5 hover:bg-green-900/30 transition">
                                  ↓ DL
                                </a>
                                <button
                                  onClick={() => handleDeleteProjectPhoto(pdf.id)}
                                  disabled={deletingPhotoId === pdf.id}
                                  className="text-xs text-red-400 border border-red-700 rounded px-2 py-0.5 hover:bg-red-900/30 transition disabled:opacity-50"
                                >削除</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {role === "ADMIN" && images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {images.map((photo) => {
                        const url = photo.filename.startsWith("http") ? photo.filename : `/uploads/${photo.filename}`;
                        return (
                          <a key={photo.id} href={url} download={photo.originalName}
                            className="text-xs text-blue-400 border border-blue-700 rounded px-2 py-1 hover:bg-blue-900/40 transition">
                            ↓ {photo.originalName}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            <p className="text-xs text-gray-500 text-center py-3">写真・PDFはありません</p>
          )}
        </div>

        {/* 管理者向けステータス操作 */}
        {role === "ADMIN" && ["INSPECTED", "QUOTE_REQUESTED", "QUOTE_REVIEWING"].includes(project.status) && (
          <div className="mb-4 bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-400 mb-3">管理者操作</p>
            <div className="flex flex-wrap gap-2">
              {project.status === "INSPECTED" && !isSelfJob && (
                <button
                  onClick={() => changeStatus("QUOTE_REQUESTED")}
                  disabled={updating}
                  className="flex-1 min-w-0 bg-orange-900/300 text-white text-sm rounded-lg py-2.5 font-medium hover:bg-orange-600 disabled:opacity-50 transition"
                >
                  📋 見積依頼する
                </button>
              )}
              {/* 完了ボタン：INSPECTED / QUOTE_REQUESTED / QUOTE_REVIEWING すべてで表示 */}
              <button
                onClick={() => changeStatus("CONFIRMED")}
                disabled={updating}
                className="flex-1 min-w-0 bg-green-600 text-white text-sm rounded-lg py-2.5 font-medium hover:bg-green-700 disabled:opacity-50 transition"
              >
                ✅ 確認・完了する
              </button>
              {!isSelfJob && (
              <button
                onClick={() => changeStatus("REWORK")}
                disabled={updating}
                className="flex-1 min-w-0 bg-gray-600 text-gray-300 text-sm rounded-lg py-2.5 font-medium hover:bg-red-900/40 hover:text-red-400 disabled:opacity-50 transition"
              >
                ↩ 差し戻す（再報告要求）
              </button>
              )}
            </div>
          </div>
        )}

        {/* 完了済案件の復活（管理者のみ）：追加工事に対応 */}
        {role === "ADMIN" && ["CONFIRMED", "COMPLETED"].includes(project.status) && (
          <div className="mb-4 bg-gray-800 rounded-xl border border-gray-700 p-4">
            <p className="text-xs font-bold text-gray-400 mb-2">管理者操作</p>
            <p className="text-xs text-gray-400 mb-3">追加工事などで、この完了済案件を再び進行中に戻せます。</p>
            <button
              onClick={reviveProject}
              disabled={updating}
              className="w-full bg-blue-600 text-white text-sm rounded-lg py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              🔄 追加工事のため復活する
            </button>
          </div>
        )}

        {/* 協力会社向けアクションボタン */}
        {canInspect && (
          <div className="mb-4 space-y-3">
            {/* PENDING：受注 or 差し戻し（自社案件は自分で登録済みなので受注不要→完了報告へ） */}
            {project.status === "PENDING" && !isSelfJob && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                <p className="text-xs text-gray-400 mb-3 text-center">この依頼を受けますか？</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => changeStatus("REJECTED")}
                    disabled={updating}
                    className="bg-gray-700 text-gray-300 border border-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-red-900/30 hover:text-red-400 hover:border-red-700 disabled:opacity-50 transition"
                  >
                    ✕ 辞退する
                  </button>
                  <button
                    onClick={() => changeStatus("ACCEPTED")}
                    disabled={updating}
                    className="bg-blue-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
                  >
                    ✓ 受注する
                  </button>
                </div>
              </div>
            )}
            {/* ACCEPTED（自社案件はPENDINGでも）：完了報告 */}
            {(project.status === "ACCEPTED" || (project.status === "PENDING" && isSelfJob)) && (
              <Link
                href={`/projects/${id}/inspect`}
                className="block w-full bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition text-center"
              >
                📋 完了報告する
              </Link>
            )}
            {/* REWORK：再報告 */}
            {project.status === "REWORK" && (
              <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4">
                <p className="text-xs text-amber-300 font-medium mb-3 text-center">⚠ 管理者から内容の確認・修正を求められています</p>
                <Link
                  href={`/projects/${id}/inspect`}
                  className="block w-full bg-amber-900/300 text-white rounded-xl py-3 text-sm font-medium hover:bg-amber-600 transition text-center"
                >
                  📋 再報告する
                </Link>
              </div>
            )}
            {["QUOTE_REQUESTED", "QUOTE_REVIEWING"].includes(project.status) && !isSelfJob && (
              <Link
                href={`/projects/${id}/quote`}
                className="block w-full bg-orange-900/300 text-white rounded-xl py-3 text-sm font-medium hover:bg-orange-600 transition text-center"
              >
                見積もりを提出する
              </Link>
            )}
          </div>
        )}

        {/* 完了報告 */}
        {project.inspections.length > 0 && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-3">
            <h3 className="text-sm font-bold text-gray-100 mb-3">完了報告</h3>
            {project.inspections.map((insp) => (
              <div key={insp.id} className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      insp.result === "REPAIR_NEEDED"
                        ? "bg-red-900/40 text-red-300"
                        : "bg-green-900/40 text-green-300"
                    }`}
                  >
                    {insp.result === "REPAIR_NEEDED" ? "修理が必要" : "問題なし"}
                  </span>
                  <span className="text-xs text-gray-300 font-medium">
                    🔧 作業日: {
                      insp.workDates.length > 1
                        ? insp.workDates.sort().map((d) => new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })).join("・") + `（最終: ${new Date(insp.workDate).toLocaleDateString("ja-JP")}）`
                        : new Date(insp.workDate).toLocaleDateString("ja-JP")
                    }
                  </span>
                  <span className="text-xs text-gray-500">
                    {insp.inspector.companyName || insp.inspector.name}
                  </span>
                </div>
                {insp.notes && (
                  <p className="text-sm text-gray-200 whitespace-pre-wrap bg-gray-700/40 rounded-lg p-3">
                    {insp.notes}
                  </p>
                )}
                {/* AI清書（積水向け・管理者のみ） */}
                {role === "ADMIN" && insp.notes && (
                  <div className="bg-indigo-900/30 border border-indigo-700/60 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-bold text-indigo-300">✨ 積水向け清書</p>
                      <div className="flex gap-1.5">
                        {insp.polishedReport && editingPolishId !== insp.id && (
                          <>
                            <button
                              onClick={() => copyPolish(insp.polishedReport!, insp.id)}
                              className="text-xs bg-indigo-600 text-white rounded px-2.5 py-1 hover:bg-indigo-700 transition"
                            >
                              {copiedPolishId === insp.id ? "✓ コピーしました" : "📋 コピー"}
                            </button>
                            <button
                              onClick={() => { setEditingPolishId(insp.id); setPolishText(insp.polishedReport!); }}
                              className="text-xs text-indigo-300 border border-indigo-700 rounded px-2 py-1 hover:bg-indigo-900/50 transition"
                            >
                              編集
                            </button>
                          </>
                        )}
                        {editingPolishId !== insp.id && (
                          <button
                            onClick={() => generatePolish(insp.id)}
                            disabled={polishingId === insp.id}
                            className="text-xs text-indigo-300 border border-indigo-700 rounded px-2 py-1 hover:bg-indigo-900/50 disabled:opacity-50 transition"
                          >
                            {polishingId === insp.id ? "清書中…" : insp.polishedReport ? "再生成" : "✨ 清書を作成"}
                          </button>
                        )}
                      </div>
                    </div>
                    {editingPolishId === insp.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={polishText}
                          onChange={(e) => setPolishText(e.target.value)}
                          rows={10}
                          className="w-full bg-gray-900/60 border border-indigo-700 rounded-lg p-3 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingPolishId(null)} className="text-xs text-gray-400 px-2 py-1 hover:text-gray-200">キャンセル</button>
                          <button onClick={() => savePolish(insp.id)} className="text-xs bg-indigo-600 text-white rounded px-3 py-1 hover:bg-indigo-700 transition">保存</button>
                        </div>
                      </div>
                    ) : insp.polishedReport ? (
                      <>
                        <p className="text-sm text-gray-100 whitespace-pre-wrap bg-gray-900/50 rounded-lg p-3">{insp.polishedReport}</p>
                        {(polishWarnings[insp.id]?.length ?? 0) > 0 && (
                          <div className="bg-amber-900/30 border border-amber-700/60 rounded-lg p-2.5">
                            <p className="text-xs font-bold text-amber-300 mb-1">⚠ 入力内容から判断できなかった事項（送信前に確認）</p>
                            <ul className="space-y-0.5">
                              {polishWarnings[insp.id].map((u, i) => (
                                <li key={i} className="text-xs text-amber-200">・{u}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-indigo-300/70">協力会社の報告をAIが積水ハウス向けの報告文に清書します。作成後はコピーしてそのまま送れます。</p>
                    )}
                  </div>
                )}
                {insp.photos.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400">作業写真 ({insp.photos.length}枚)</p>
                    {(["before", "during", "after", "other"] as const).map((cat) => {
                      const labels: Record<string, string> = { before: "点検前", during: "点検中", after: "点検後", other: "その他" };
                      const catPhotos = insp.photos.filter((p) => (p.category || "before") === cat);
                      if (catPhotos.length === 0) return null;
                      return (
                        <div key={cat}>
                          <p className="text-xs font-semibold text-gray-400 mb-1">{labels[cat]}</p>
                          <div className="grid grid-cols-3 gap-2">
                            {catPhotos.map((photo) => {
                              const url = photo.filename.startsWith("http") ? photo.filename : `/uploads/${photo.filename}`;
                              return (
                                <div key={photo.id} className="relative group">
                                  <a href={url} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={photo.originalName} className="w-full h-24 object-cover rounded-lg border border-gray-700 hover:opacity-80 transition" />
                                  </a>
                                  {role === "ADMIN" && (
                                    <a href={url} download={photo.originalName} className="absolute bottom-1 right-1 bg-blue-600 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition">↓</a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {role === "ADMIN" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {insp.photos.map((photo) => {
                          const url = photo.filename.startsWith("http") ? photo.filename : `/uploads/${photo.filename}`;
                          return (
                            <a
                              key={photo.id}
                              href={url}
                              download={photo.originalName}
                              className="text-xs text-blue-400 border border-blue-700 rounded px-2 py-1 hover:bg-blue-900/40 transition"
                            >
                              ↓ {photo.originalName}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 見積もり */}
        {project.quotes.length > 0 && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-100 mb-3">見積もり</h3>
            {project.quotes.map((quote) => (
              <div key={quote.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-100">
                    {quote.amount ? `¥${quote.amount.toLocaleString()}` : "金額未記入"}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-900/40 text-green-300">
                    提出済み
                  </span>
                </div>
                {quote.notes && (
                  <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-700/40 rounded-lg p-3">
                    {quote.notes}
                  </p>
                )}
                {quote.filename && (
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={quote.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                    >
                      📎 見積書を開く
                    </a>
                    {role === "ADMIN" && (
                      <a
                        href={quote.filename}
                        download
                        className="text-xs text-green-400 border border-green-700 rounded px-2 py-0.5 hover:bg-green-900/30 transition"
                      >
                        ↓ ダウンロード
                      </a>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  {new Date(quote.createdAt).toLocaleDateString("ja-JP")} /{" "}
                  {quote.submittedBy.companyName || quote.submittedBy.name}
                </p>

              </div>
            ))}
          </div>
        )}

        </div>

        <div className="min-w-0 lg:sticky lg:top-4">
        {/* 急ぎの電話（チャット上） */}
        {role === "PARTNER" && project.createdBy.phone && (
          <div className="mt-4 flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs text-gray-500">通常の連絡はチャットをご利用ください</p>
              <p className="text-xs text-gray-400 mt-0.5">緊急の場合のみ電話でご連絡ください</p>
            </div>
            <a
              href={`tel:${project.createdBy.phone.replace(/[^0-9+]/g, "")}`}
              className="shrink-0 ml-3 inline-flex items-center gap-1.5 bg-gray-700 border border-gray-600 text-gray-500 text-xs font-medium px-3 py-2 rounded-lg hover:bg-gray-600 transition"
            >
              📞 急ぎの確認
            </a>
          </div>
        )}

        {/* 📝 メモ（各自専用・相手には非公開）。管理者は全案件、協力会社は担当案件で表示 */}
        {(role === "ADMIN" || (role === "PARTNER" && isAssigned)) && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-100">📝 メモ</h3>
              {memoSaved && <span className="text-xs text-green-400">✓ 保存しました</span>}
            </div>
            <textarea
              value={memoInput}
              onChange={(e) => { setMemoInput(e.target.value); setMemoSaved(false); }}
              onBlur={saveMemo}
              rows={5}
              placeholder={role === "PARTNER"
                ? "この案件のメモ（作業内容・気づいたことなど）\n※自分用。管理者には表示されません"
                : "この案件のメモ（作業内容・連絡事項・気づいたことなど）\n※自分用。協力会社には表示されません"}
              className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={saveMemo}
                disabled={savingMemo}
                className="text-xs bg-blue-600 text-white rounded-lg px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {savingMemo ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        )}

        {/* コメント（自社案件は相談相手がいないので非表示） */}
        {!isSelfJob && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-100">💬 相談・確認チャット</h3>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-xs text-gray-500">
                  {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 更新
                </span>
              )}
              <button
                onClick={() => fetchProject(true)}
                disabled={refreshing}
                className="text-gray-500 hover:text-blue-400 transition disabled:opacity-40 text-sm"
                title="コメントを更新"
              >
                <span className={refreshing ? "animate-spin inline-block" : ""}>🔄</span>
              </button>
            </div>
          </div>
          {project.comments.length === 0 && (
            <div className="mb-3 rounded-xl bg-blue-900/40 border border-blue-800 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-blue-300">💬 このチャットを活用してください</p>
              <p className="text-xs text-blue-400">質問・確認・連絡はここに残してください。</p>
              <ul className="text-xs text-blue-400 space-y-0.5 pl-3 list-disc">
                {role === "PARTNER" ? (
                  <>
                    <li>作業日の調整や遅延の連絡</li>
                    <li>現場で気になった点の共有</li>
                    <li>作業前後の確認・質問</li>
                  </>
                ) : (
                  <>
                    <li>協力会社への追加指示や変更連絡</li>
                    <li>見積・日程に関する確認</li>
                    <li>現場状況のヒアリング</li>
                  </>
                )}
              </ul>
            </div>
          )}
          {project.comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {project.comments.map((c) => {
                const isAdmin = c.author.role === "ADMIN";
                const isMine = c.authorId === userId;
                const displayName = c.author.companyName || c.author.name;
                const avatarSrc = c.author.avatarUrl
                  ? (c.author.avatarUrl.startsWith("http") ? c.author.avatarUrl : `/uploads/${c.author.avatarUrl}`)
                  : null;
                return (
                  <div key={c.id} className={`flex gap-2 items-end ${isAdmin ? "flex-row" : "flex-row-reverse"}`}>
                    {/* アバター */}
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSrc} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-gray-700 shrink-0" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border ${isAdmin ? "bg-blue-900/50 text-blue-400 border-blue-700" : "bg-gray-700 text-gray-300 border-gray-700"}`}>
                        {displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className={`flex flex-col max-w-[75%] ${isAdmin ? "items-start" : "items-end"}`}>
                      <div className={`rounded-xl px-3 py-2 text-sm ${
                        isAdmin
                          ? "bg-blue-900/40 text-gray-100 rounded-tl-none"
                          : "bg-gray-700 text-gray-100 rounded-tr-none"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{renderWithLinks(c.content)}</p>
                      </div>
                      {/* リアクション */}
                      <div className={`flex flex-wrap items-center gap-1 mt-1 px-1 relative ${isAdmin ? "flex-row" : "flex-row-reverse"}`}>
                        {Object.entries(
                          c.reactions.reduce<Record<string, string[]>>((acc, r) => {
                            acc[r.emoji] = acc[r.emoji] ? [...acc[r.emoji], r.userId] : [r.userId];
                            return acc;
                          }, {})
                        ).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(c.id, emoji)}
                            className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition ${
                              users.includes(userId ?? "")
                                ? "bg-blue-900/50 border-blue-700 text-blue-300"
                                : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700/40"
                            }`}
                          >
                            {emoji} <span>{users.length}</span>
                          </button>
                        ))}
                        <button
                          onClick={() => setReactionPickerId(reactionPickerId === c.id ? null : c.id)}
                          className="text-xs text-gray-500 hover:text-gray-400 px-1 transition"
                        >＋</button>
                        {reactionPickerId === c.id && (
                          <div className={`absolute bottom-7 z-10 bg-gray-800 border border-gray-700 rounded-xl shadow-lg px-2 py-1.5 flex gap-1 ${isAdmin ? "left-0" : "right-0"}`}>
                            {REACTION_EMOJIS.map((e) => (
                              <button key={e} onClick={() => toggleReaction(c.id, e)} className="text-xl hover:scale-125 transition-transform">
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={`flex items-center gap-2 mt-0.5 px-1 ${isAdmin ? "flex-row" : "flex-row-reverse"}`}>
                        <p className="text-xs text-gray-500">
                          {displayName} · {new Date(c.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {isMine && c.readAt && (
                          <span className="text-xs text-blue-400">既読</span>
                        )}
                        {isMine && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            disabled={deletingCommentId === c.id}
                            className="text-xs text-gray-500 hover:text-red-400 transition disabled:opacity-40"
                            title="送信取消"
                          >
                            {deletingCommentId === c.id ? "…" : "取消"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={2}
              placeholder="コメントを入力…"
              className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={sendComment}
              disabled={sendingComment || !commentText.trim()}
              className="bg-blue-600 text-white text-sm px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition self-end"
            >
              送信
            </button>
          </div>
        </div>
        )}

        </div>

        <div className="min-w-0 lg:col-start-1">
        {/* 活動ログ */}
        {project.activityLogs.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowLog(!showLog)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 rounded-xl text-sm text-gray-500 hover:bg-gray-700 transition"
            >
              <span>🕐 活動履歴 ({project.activityLogs.length}件)</span>
              <span>{showLog ? "▲ 閉じる" : "▼ 表示する"}</span>
            </button>
            {showLog && (
              <div className="mt-2 bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
                {project.activityLogs.map((log) => {
                  const actionLabel: Record<string, string> = {
                    CREATED: "依頼作成",
                    STATUS_CHANGED: "ステータス変更",
                    INSPECTION: "完了報告",
                    QUOTE_SUBMITTED: "見積提出",
                    QUOTE_APPROVED: "見積承認",
                    QUOTE_REJECTED: "見積却下",
                    COMMENT: "コメント",
                    ASSIGNED: "担当者設定",
                    CONTACT_ATTEMPT: "連絡記録",
                    HOLD: "保留",
                    HOLD_RELEASED: "保留解除",
                  };
                  return (
                    <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-200">
                          {actionLabel[log.action] || log.action}
                        </p>
                        {log.detail && (
                          <p className="text-xs text-gray-400 mt-0.5">{log.detail}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">
                          {new Date(log.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {log.user && (
                          <p className="text-xs text-gray-500">{log.user.name}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
        </div>
      </main>
    </div>
  );
}
