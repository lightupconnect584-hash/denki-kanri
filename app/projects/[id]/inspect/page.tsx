"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/Header";

interface UploadedPhoto {
  filename: string;
  originalName: string;
  preview: string;
}

export default function InspectPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [result, setResult] = useState<"OK" | "REPAIR_NEEDED" | "">("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));

  // 詳細内容テンプレート（4セクション）
  const [situation, setSituation] = useState("");
  const [cause, setCause] = useState("");
  const [response, setResponse] = useState("");
  const [other, setOther] = useState("");

  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState("");

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    setUploadError("");
    const uploaded: UploadedPhoto[] = [];

    for (const file of Array.from(files)) {
      try {
        const compressedFile = await new Promise<File>((resolve, reject) => {
          const img = new window.Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            const MAX = 1920;
            let w = img.width;
            let h = img.height;
            if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(file); return; }
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              URL.revokeObjectURL(url);
              if (!blob) { resolve(file); return; }
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
            }, "image/jpeg", 0.75);
          };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像の読み込みに失敗しました")); };
          img.src = url;
        });

        const formData = new FormData();
        formData.append("file", compressedFile);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          uploaded.push({
            filename: data.filename,
            originalName: data.originalName,
            preview: URL.createObjectURL(compressedFile),
          });
        } else {
          setUploadError(`アップロード失敗 (${file.name}, status:${res.status})`);
        }
      } catch (e) {
        setUploadError(`エラー: ${String(e)} (${file.name})`);
      }
    }

    setPhotos((prev) => [...prev, ...uploaded]);
    setUploading(false);
  };

  const removePhoto = (filename: string) => {
    setPhotos((prev) => prev.filter((p) => p.filename !== filename));
  };

  // 4セクションを1つの文字列に結合
  const buildNotes = () =>
    `【状況】\n${situation.trim()}\n\n【原因】\n${cause.trim()}\n\n【対応】\n${response.trim()}${other.trim() ? `\n\n【その他】\n${other.trim()}` : ""}`;

  const canSubmit = !!result && !!workDate && situation.trim() && cause.trim() && response.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    await fetch(`/api/projects/${id}/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result,
        workDate,
        notes: buildNotes(),
        photos: photos.map((p) => ({ filename: p.filename, originalName: p.originalName })),
      }),
    });

    router.push(`/projects/${id}`);
  };

  const fieldClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white">
            ←
          </button>
          <h2 className="text-lg font-bold text-white">完了報告</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 点検結果 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-bold text-gray-700 mb-3">作業結果 *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setResult("OK")}
                className={`py-4 rounded-xl border-2 text-sm font-medium transition ${
                  result === "OK"
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-200 text-gray-600 hover:border-green-300"
                }`}
              >
                ✅ 問題なし
              </button>
              <button
                type="button"
                onClick={() => setResult("REPAIR_NEEDED")}
                className={`py-4 rounded-xl border-2 text-sm font-medium transition ${
                  result === "REPAIR_NEEDED"
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-gray-200 text-gray-600 hover:border-red-300"
                }`}
              >
                🔧 修理が必要
              </button>
            </div>
          </div>

          {/* 作業日 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-bold text-gray-700 mb-2">作業日 *</label>
            <input
              type="date"
              required
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 詳細内容（4セクション） */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <p className="text-sm font-bold text-gray-700">詳細内容 *</p>
            <p className="text-xs text-gray-400 -mt-2">状況・原因・対応は必須入力です</p>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                状況 <span className="text-red-500">*</span>
                <span className="font-normal text-gray-400 ml-1">例：漏電による共用ブレーカー落ち</span>
              </label>
              <textarea
                rows={2}
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="どのような状況だったか"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                原因 <span className="text-red-500">*</span>
                <span className="font-normal text-gray-400 ml-1">例：漏電箇所を具体的に</span>
              </label>
              <textarea
                rows={2}
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                placeholder="原因の詳細"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                対応 <span className="text-red-500">*</span>
                <span className="font-normal text-gray-400 ml-1">例：漏電箇所を切り離して復旧させた</span>
              </label>
              <textarea
                rows={2}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="実施した対応内容"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                その他
                <span className="font-normal text-gray-400 ml-1">気になったことなど（任意）</span>
              </label>
              <textarea
                rows={2}
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="その他、特記事項があれば"
                className={fieldClass}
              />
            </div>
          </div>

          {/* 写真 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-bold text-gray-700 mb-3">作業写真</label>
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-xl py-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
              <span className="text-2xl">📷</span>
              <span className="text-sm text-gray-600">
                {uploading ? "アップロード中..." : "写真を選択（複数可）"}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
                disabled={uploading}
              />
            </label>

            {uploadError && (
              <p className="text-xs text-red-500 mt-2 break-all">{uploadError}</p>
            )}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {photos.map((photo) => (
                  <div key={photo.filename} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.preview}
                      alt={photo.originalName}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.filename)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {submitting ? "送信中..." : "完了報告を送信する"}
          </button>
          {!canSubmit && (
            <p className="text-xs text-center text-red-400">作業結果・作業日・詳細内容（状況・原因・対応）は必須です</p>
          )}
        </form>
      </main>
    </div>
  );
}
