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
  status: string;
  dueDate: string | null;
  assignedTo: { id: string; name: string; companyName: string | null; email: string } | null;
  createdBy: { name: string };
  projectPhotos: ProjectPhoto[];
  inspections: Inspection[];
  quotes: Quote[];
}

export default function ProjectDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const role = (session?.user as { role?: string })?.role;
  const userId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchProject = () => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (status === "authenticated") fetchProject();
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

  if (loading || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const isAssigned = project.assignedTo?.id === userId;
  const canInspect = role === "PARTNER" && isAssigned;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">
            ←
          </button>
          <h2 className="text-lg font-bold text-gray-800 flex-1 truncate">{project.title}</h2>
          <StatusBadge status={project.status} />
          {role === "ADMIN" && (
            <button
              onClick={deleteProject}
              disabled={updating}
              className="text-xs text-red-500 hover:text-red-700 border border-red-300 rounded px-2 py-1 disabled:opacity-50"
            >
              削除
            </button>
          )}
        </div>

        {/* 基本情報 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-3">
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
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-700">{project.contractorPhone}</p>
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
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.description}</p>
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
              <p className="text-sm font-medium text-gray-800">¥{project.amount.toLocaleString()}</p>
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
        </div>

        {/* 現場写真・PDF */}
        {project.projectPhotos && project.projectPhotos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">現場写真・PDF</h3>
            {/* 画像サムネイル */}
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
                  {/* PDFリスト */}
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
                  {/* 管理者向け画像一括ダウンロードリンク */}
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

        {/* 協力会社向けアクションボタン */}
        {canInspect && (
          <div className="mb-4 space-y-2">
            {project.status === "PENDING" && (
              <button
                onClick={startInspection}
                disabled={updating}
                className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                点検を開始する
              </button>
            )}
            {(project.status === "INSPECTING") && (
              <Link
                href={`/projects/${id}/inspect`}
                className="block w-full bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition text-center"
              >
                点検結果を報告する
              </Link>
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

        {/* 点検報告 */}
        {project.inspections.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">点検報告</h3>
            {project.inspections.map((insp) => (
              <div key={insp.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      insp.result === "REPAIR_NEEDED"
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {insp.result === "REPAIR_NEEDED" ? "修理が必要" : "問題なし"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(insp.createdAt).toLocaleDateString("ja-JP")} /{" "}
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
                    <p className="text-xs text-gray-500 mb-2">点検写真 ({insp.photos.length}枚)</p>
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
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      quote.status === "APPROVED"
                        ? "bg-green-100 text-green-700"
                        : quote.status === "REJECTED"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {quote.status === "APPROVED" ? "承認済" : quote.status === "REJECTED" ? "却下" : "確認中"}
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

                {role === "ADMIN" && quote.status === "PENDING" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => updateQuoteStatus(quote.id, "APPROVED")}
                      disabled={updating}
                      className="flex-1 bg-green-600 text-white text-xs rounded-lg py-2 hover:bg-green-700 disabled:opacity-50 transition"
                    >
                      承認する
                    </button>
                    <button
                      onClick={() => updateQuoteStatus(quote.id, "REJECTED")}
                      disabled={updating}
                      className="flex-1 bg-red-500 text-white text-xs rounded-lg py-2 hover:bg-red-600 disabled:opacity-50 transition"
                    >
                      却下する
                    </button>
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
