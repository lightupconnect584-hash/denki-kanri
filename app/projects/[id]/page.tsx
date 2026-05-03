"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

interface Photo {
  id: string;
  filename: string;
  originalName: string;
}

interface Inspection {
  id: string;
  result: string;
  workDate: string;
  notes: string | null;
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
  author: { name: string; companyName: string | null; role: string; avatarUrl: string | null };
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
  contractorName: string | null;
  contractorPhone: string | null;
  smsAllowed: boolean;
  description: string | null;
  urgency: string;
  amount: number | null;
  visitDate: string | null;
  status: string;
  dueDate: string | null;
  assignedTo: { id: string; name: string; companyName: string | null; email: string } | null;
  createdBy: { name: string; avatarUrl: string | null; phone: string | null };
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
  const [visitInput, setVisitInput] = useState("");
  const [savingVisit, setSavingVisit] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const role = (session?.user as { role?: string })?.role;
  const userId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchProject = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        // visitDateを日付のみ（YYYY-MM-DD）に変換してセット
        if (data.visitDate) {
          const d = new Date(data.visitDate);
          const pad = (n: number) => String(n).padStart(2, "0");
          setVisitInput(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        } else {
          setVisitInput("");
        }
        setLoading(false);
        setRefreshing(false);
        setLastUpdated(new Date());
        // 既読としてlocalStorageに記録（閲覧した時刻を保存）
        try { localStorage.setItem(`proj-seen-${id}`, new Date().toISOString()); } catch {}
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

  const deleteProject = async () => {
    if (!confirm("この案件を削除しますか？この操作は取り消せません。")) return;
    setUpdating(true);
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  };

  const changeStatus = async (newStatus: string) => {
    const labels: Record<string, string> = {
      QUOTE_REQUESTED: "見積依頼",
      COMPLETED: "完了",
      CONFIRMED: "確認",
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
    if (!commentText.trim()) return;
    setSendingComment(true);
    await fetch(`/api/projects/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: commentText.trim() }),
    });
    setCommentText("");
    fetchProject();
    setSendingComment(false);
  };

  const saveVisitDate = async () => {
    setSavingVisit(true);
    // 日付のみ入力 → 09:00 JST として保存
    const dateToSave = visitInput ? new Date(`${visitInput}T09:00:00`).toISOString() : null;
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitDate: dateToSave }),
    });
    fetchProject();
    setSavingVisit(false);
  };

  if (loading || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const isAssigned = project.assignedTo?.id === userId;
  const canInspect = role === "PARTNER" && isAssigned;

  // 訪問予定日のラベル
  const getVisitLabel = (dateStr: string | null) => {
    if (!dateStr) return null;
    const visit = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((visit.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / 86400000);
    if (diffDays < 0) return { text: "訪問済み", color: "bg-gray-100 text-gray-500" };
    if (diffDays === 0) return { text: "今日", color: "bg-red-100 text-red-700" };
    if (diffDays === 1) return { text: "明日", color: "bg-orange-100 text-orange-700" };
    if (diffDays <= 3) return { text: `${diffDays}日後`, color: "bg-yellow-100 text-yellow-700" };
    return { text: `${diffDays}日後`, color: "bg-blue-50 text-blue-600" };
  };

  const visitLabel = getVisitLabel(project.visitDate);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">
            ←
          </button>
          <button
            onClick={() => fetchProject(true)}
            disabled={refreshing}
            className="text-gray-400 hover:text-blue-500 transition disabled:opacity-40 shrink-0 ml-auto"
            title="更新"
          >
            <span className={`text-base ${refreshing ? "animate-spin inline-block" : ""}`}>🔄</span>
          </button>
          <StatusBadge status={project.status} />
          {role === "ADMIN" && (
            <div className="flex gap-2">
              <Link
                href={`/projects/${id}/edit`}
                className="text-xs text-blue-500 hover:text-blue-700 border border-blue-300 rounded px-2 py-1"
              >
                編集
              </Link>
              <button
                onClick={deleteProject}
                disabled={updating}
                className="text-xs text-red-500 hover:text-red-700 border border-red-300 rounded px-2 py-1 disabled:opacity-50"
              >
                削除
              </button>
            </div>
          )}
        </div>

        {/* 基本情報 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-3">
          <div>
            <h2 className="text-base font-bold text-gray-800 leading-snug">{project.title}</h2>
          </div>
          <div>
            <p className="text-xs text-gray-500">住所</p>
            <p className="text-sm font-medium text-gray-800">📍 {project.location}</p>
          </div>
          {project.contractorName && (
            <div>
              <p className="text-xs text-gray-500">契約者名</p>
              <p className="text-sm text-gray-700">{project.contractorName}</p>
            </div>
          )}
          {project.contractorPhone && (
            <div>
              <p className="text-xs text-gray-500">契約者連絡先</p>
              <div className="flex items-center gap-3 flex-wrap">
                <a
                  href={`tel:${project.contractorPhone.replace(/[^0-9+]/g, "")}`}
                  className="text-sm font-medium text-blue-600 hover:underline whitespace-nowrap"
                >
                  📞 {project.contractorPhone}
                </a>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  project.smsAllowed ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                }`}>
                  SMS {project.smsAllowed ? "可" : "不可"}
                </span>
              </div>
            </div>
          )}
          {project.description && (
            <div>
              <p className="text-xs text-gray-500">依頼内容</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words overflow-hidden">{project.description}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500">緊急度</p>
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
              project.urgency === "HIGH"
                ? "bg-red-100 text-red-700"
                : project.urgency === "MEDIUM"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-green-100 text-green-700"
            }`}>
              {project.urgency === "HIGH" ? "高" : project.urgency === "MEDIUM" ? "中" : "低"}
            </span>
          </div>
          {project.amount != null && (
            <div>
              <p className="text-xs text-gray-500">金額【税別】</p>
              {(() => {
                const lastChange = project.activityLogs.find((l) => l.action === "AMOUNT_CHANGED");
                const originalAmountStr = lastChange?.detail?.split(" → ")[0];
                return (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {originalAmountStr && originalAmountStr !== "未設定" && originalAmountStr !== `¥${project.amount.toLocaleString()}` && (
                      <span className="text-sm text-gray-400 line-through">{originalAmountStr}</span>
                    )}
                    <span className={`text-sm font-medium ${lastChange && originalAmountStr !== `¥${project.amount.toLocaleString()}` ? "text-orange-700" : "text-gray-800"}`}>
                      ¥{project.amount.toLocaleString()}
                    </span>
                    {lastChange && originalAmountStr !== `¥${project.amount.toLocaleString()}` && (
                      <span className="text-xs text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">変更済</span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          {project.dueDate && (
            <div>
              <p className="text-xs text-gray-500">期日</p>
              <p className="text-sm text-gray-700">{new Date(project.dueDate).toLocaleDateString("ja-JP")}</p>
            </div>
          )}
          {project.assignedTo && (
            <div>
              <p className="text-xs text-gray-500">担当協力会社</p>
              <p className="text-sm text-gray-700">
                {project.assignedTo.companyName || project.assignedTo.name}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500">依頼者</p>
            <div className="flex items-center gap-2 mt-1">
              {project.createdBy.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={project.createdBy.avatarUrl.startsWith("http") ? project.createdBy.avatarUrl : `/uploads/${project.createdBy.avatarUrl}`}
                  alt={project.createdBy.name}
                  className="w-6 h-6 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 border border-gray-200">
                  {project.createdBy.name[0]?.toUpperCase()}
                </div>
              )}
              <p className="text-sm text-gray-700">{project.createdBy.name}</p>
            </div>
            {role === "PARTNER" && project.createdBy.phone && (
              <a
                href={`tel:${project.createdBy.phone.replace(/[^0-9+]/g, "")}`}
                className="inline-flex items-center gap-1.5 mt-2 bg-green-50 border border-green-300 text-green-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-green-100 transition"
              >
                📞 管理者に電話する ({project.createdBy.phone})
              </a>
            )}
          </div>
        </div>

        {/* 訪問予定日 */}
        {!(role === "PARTNER" && project.status === "QUOTE_REQUESTED") && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">📅 訪問予定日</h3>
          {project.visitDate && visitLabel && (
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-medium text-gray-800">
                {new Date(project.visitDate).toLocaleString("ja-JP", {
                  year: "numeric", month: "long", day: "numeric",
                  weekday: "short",
                  hour: new Date(project.visitDate).getMinutes() !== 0 ||
                    new Date(project.visitDate).getHours() !== 0 ? "2-digit" : undefined,
                  minute: new Date(project.visitDate).getMinutes() !== 0 ||
                    new Date(project.visitDate).getHours() !== 0 ? "2-digit" : undefined,
                })}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visitLabel.color}`}>
                {visitLabel.text}
              </span>
            </div>
          )}
          {!project.visitDate && (
            <p className="text-sm text-gray-400 mb-3">未設定</p>
          )}
          {/* 担当協力会社のみ・PENDING or ACCEPTED中は編集可 */}
          {role === "PARTNER" && isAssigned && ["PENDING", "ACCEPTED", "REWORK"].includes(project.status) ? (
            <>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={visitInput}
                  onChange={(e) => setVisitInput(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    onClick={() => { setVisitInput(""); }}
                    className="text-gray-400 hover:text-red-500 text-sm px-2"
                    title="クリア"
                  >
                    ✕
                  </button>
                )}
              </div>
            </>
          ) : role === "PARTNER" && isAssigned && !["PENDING", "ACCEPTED"].includes(project.status) ? (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              🔒 完了報告後は訪問予定日を変更できません
            </p>
          ) : null}
        </div>
        )}

        {/* 現場写真・PDF */}
        {project.projectPhotos && project.projectPhotos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">現場写真・PDF</h3>
            {(() => {
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
                                className="w-full h-24 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition"
                              />
                            </a>
                            {role === "ADMIN" && (
                              <a
                                href={url}
                                download={photo.originalName}
                                className="absolute bottom-1 right-1 bg-blue-600 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition"
                              >
                                ↓
                              </a>
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
                          <div key={pdf.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline flex items-center gap-2">
                              <span>📄</span>{pdf.originalName}
                            </a>
                            {role === "ADMIN" && (
                              <a href={url} download={pdf.originalName}
                                className="text-xs text-green-600 border border-green-300 rounded px-2 py-0.5 hover:bg-green-50 transition">
                                ↓ DL
                              </a>
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
                            className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50 transition">
                            ↓ {photo.originalName}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* 管理者向けステータス操作（完了報告後のみ表示） */}
        {role === "ADMIN" && ["INSPECTED", "QUOTE_REQUESTED"].includes(project.status) && (
          <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-500 mb-3">管理者操作</p>
            <div className="flex flex-wrap gap-2">
              {project.status === "INSPECTED" && (
                <button
                  onClick={() => changeStatus("QUOTE_REQUESTED")}
                  disabled={updating}
                  className="flex-1 min-w-0 bg-orange-500 text-white text-sm rounded-lg py-2.5 font-medium hover:bg-orange-600 disabled:opacity-50 transition"
                >
                  📋 見積依頼する
                </button>
              )}
              <button
                onClick={() => changeStatus("CONFIRMED")}
                disabled={updating}
                className="flex-1 min-w-0 bg-green-600 text-white text-sm rounded-lg py-2.5 font-medium hover:bg-green-700 disabled:opacity-50 transition"
              >
                ✅ 確認する
              </button>
              <button
                onClick={() => changeStatus("REWORK")}
                disabled={updating}
                className="flex-1 min-w-0 bg-gray-200 text-gray-600 text-sm rounded-lg py-2.5 font-medium hover:bg-red-100 hover:text-red-600 disabled:opacity-50 transition"
              >
                ↩ 差し戻す（再報告要求）
              </button>
            </div>
          </div>
        )}

        {/* 協力会社向けアクションボタン */}
        {canInspect && (
          <div className="mb-4 space-y-3">
            {/* PENDING：受注 or 差し戻し */}
            {project.status === "PENDING" && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-3 text-center">この依頼を受けますか？</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => changeStatus("REJECTED")}
                    disabled={updating}
                    className="bg-gray-100 text-gray-600 border border-gray-300 rounded-xl py-3 text-sm font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-300 disabled:opacity-50 transition"
                  >
                    ✕ 差し戻す
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
            {/* ACCEPTED：完了報告 */}
            {project.status === "ACCEPTED" && (
              <Link
                href={`/projects/${id}/inspect`}
                className="block w-full bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition text-center"
              >
                📋 完了報告する
              </Link>
            )}
            {/* REWORK：再報告 */}
            {project.status === "REWORK" && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <p className="text-xs text-amber-700 font-medium mb-3 text-center">⚠ 管理者から内容の確認・修正を求められています</p>
                <Link
                  href={`/projects/${id}/inspect`}
                  className="block w-full bg-amber-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-amber-600 transition text-center"
                >
                  📋 再報告する
                </Link>
              </div>
            )}
            {project.status === "QUOTE_REQUESTED" && (
              <Link
                href={`/projects/${id}/quote`}
                className="block w-full bg-orange-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-orange-600 transition text-center"
              >
                見積もりを提出する
              </Link>
            )}
          </div>
        )}

        {/* 完了報告 */}
        {project.inspections.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">完了報告</h3>
            {project.inspections.map((insp) => (
              <div key={insp.id} className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      insp.result === "REPAIR_NEEDED"
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {insp.result === "REPAIR_NEEDED" ? "修理が必要" : "問題なし"}
                  </span>
                  <span className="text-xs text-gray-600 font-medium">
                    🔧 作業日: {new Date(insp.workDate).toLocaleDateString("ja-JP")}
                  </span>
                  <span className="text-xs text-gray-400">
                    {insp.inspector.companyName || insp.inspector.name}
                  </span>
                </div>
                {insp.notes && (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                    {insp.notes}
                  </p>
                )}
                {insp.photos.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">作業写真 ({insp.photos.length}枚)</p>
                    <div className="grid grid-cols-3 gap-2">
                      {insp.photos.map((photo) => {
                        const url = photo.filename.startsWith("http") ? photo.filename : `/uploads/${photo.filename}`;
                        return (
                          <div key={photo.id} className="relative group">
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={photo.originalName}
                                className="w-full h-24 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition"
                              />
                            </a>
                            {role === "ADMIN" && (
                              <a
                                href={url}
                                download={photo.originalName}
                                className="absolute bottom-1 right-1 bg-blue-600 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition"
                              >
                                ↓
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {role === "ADMIN" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {insp.photos.map((photo) => {
                          const url = photo.filename.startsWith("http") ? photo.filename : `/uploads/${photo.filename}`;
                          return (
                            <a
                              key={photo.id}
                              href={url}
                              download={photo.originalName}
                              className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50 transition"
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
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">見積もり</h3>
            {project.quotes.map((quote) => (
              <div key={quote.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">
                    {quote.amount ? `¥${quote.amount.toLocaleString()}` : "金額未記入"}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">
                    提出済み
                  </span>
                </div>
                {quote.notes && (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                    {quote.notes}
                  </p>
                )}
                {quote.filename && (
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={quote.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      📎 見積書を開く
                    </a>
                    {role === "ADMIN" && (
                      <a
                        href={quote.filename}
                        download
                        className="text-xs text-green-600 border border-green-300 rounded px-2 py-0.5 hover:bg-green-50 transition"
                      >
                        ↓ ダウンロード
                      </a>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  {new Date(quote.createdAt).toLocaleDateString("ja-JP")} /{" "}
                  {quote.submittedBy.companyName || quote.submittedBy.name}
                </p>

              </div>
            ))}
          </div>
        )}

        {/* コメント */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">💬 相談・確認チャット</h3>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-xs text-gray-400">
                  {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 更新
                </span>
              )}
              <button
                onClick={() => fetchProject(true)}
                disabled={refreshing}
                className="text-gray-400 hover:text-blue-500 transition disabled:opacity-40 text-sm"
                title="コメントを更新"
              >
                <span className={refreshing ? "animate-spin inline-block" : ""}>🔄</span>
              </button>
            </div>
          </div>
          {project.comments.length === 0 && (
            <p className="text-sm text-gray-400 mb-3">まだコメントはありません</p>
          )}
          {project.comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {project.comments.map((c) => {
                const isAdmin = c.author.role === "ADMIN";
                const displayName = c.author.companyName || c.author.name;
                const avatarSrc = c.author.avatarUrl
                  ? (c.author.avatarUrl.startsWith("http") ? c.author.avatarUrl : `/uploads/${c.author.avatarUrl}`)
                  : null;
                return (
                  <div key={c.id} className={`flex gap-2 ${isAdmin ? "flex-row" : "flex-row-reverse"}`}>
                    {/* アバター */}
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSrc} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0 self-end" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 self-end border ${isAdmin ? "bg-blue-100 text-blue-600 border-blue-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className={`flex flex-col max-w-[75%] ${isAdmin ? "items-start" : "items-end"}`}>
                      <div className={`rounded-xl px-3 py-2 text-sm ${
                        isAdmin
                          ? "bg-blue-50 text-gray-800 rounded-tl-none"
                          : "bg-gray-100 text-gray-800 rounded-tr-none"
                      }`}>
                        <p className="whitespace-pre-wrap">{c.content}</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 px-1">
                        {displayName} · {new Date(c.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
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
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendComment(); }}
              rows={2}
              placeholder="コメントを入力… (Cmd+Enter で送信)"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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

        {/* 活動ログ */}
        {project.activityLogs.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowLog(!showLog)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 rounded-xl text-sm text-gray-600 hover:bg-gray-200 transition"
            >
              <span>🕐 活動履歴 ({project.activityLogs.length}件)</span>
              <span>{showLog ? "▲ 閉じる" : "▼ 表示する"}</span>
            </button>
            {showLog && (
              <div className="mt-2 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {project.activityLogs.map((log) => {
                  const actionLabel: Record<string, string> = {
                    CREATED: "案件作成",
                    STATUS_CHANGED: "ステータス変更",
                    INSPECTION: "完了報告",
                    QUOTE_SUBMITTED: "見積提出",
                    QUOTE_APPROVED: "見積承認",
                    QUOTE_REJECTED: "見積却下",
                    COMMENT: "コメント",
                    ASSIGNED: "担当者設定",
                  };
                  return (
                    <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                          {actionLabel[log.action] || log.action}
                        </p>
                        {log.detail && (
                          <p className="text-xs text-gray-500 mt-0.5">{log.detail}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400">
                          {new Date(log.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {log.user && (
                          <p className="text-xs text-gray-400">{log.user.name}</p>
                        )}
                      </div>
                    </div>
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
