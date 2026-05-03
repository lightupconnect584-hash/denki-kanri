"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/Header";

export default function QuotePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<{ filename: string; originalName: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", f);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      setFile({ filename: data.filename, originalName: data.originalName });
    }
    setUploading(false);
  };

  const canSubmit = amount.trim() !== "" && Number(amount) > 0 && notes.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);

    await fetch(`/api/projects/${id}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        notes,
        filename: file?.filename || null,
      }),
    });

    router.push(`/projects/${id}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            ←
          </button>
          <h2 className="text-lg font-bold text-gray-800">見積もりを提出</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {/* 金額（必須） */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                見積金額（円）<span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例: 150000"
              />
            </div>

            {/* 内容（必須） */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                内容・備考<span className="text-red-500 ml-1">*</span>
              </label>
              <textarea
                required
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="工事内容の詳細、工期、使用材料など"
              />
            </div>

            {/* 見積書ファイル（任意） */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                見積書ファイル
                <span className="text-gray-400 font-normal ml-1">（任意）</span>
              </label>
              <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-xl py-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
                <span className="text-2xl">📎</span>
                <span className="text-sm text-gray-600">
                  {uploading ? "アップロード中..." : file ? file.originalName : "ファイルを添付（PDF等）"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
              {file && (
                <p className="text-xs text-green-600 mt-1">✓ {file.originalName} をアップロードしました</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full bg-orange-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition"
          >
            {submitting ? "送信中..." : "見積もりを送信する"}
          </button>
          {!canSubmit && (
            <p className="text-xs text-center text-red-400">金額と内容は必須入力です</p>
          )}
        </form>
      </main>
    </div>
  );
}
