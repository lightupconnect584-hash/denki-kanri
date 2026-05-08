"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/Header";

interface UploadedPhoto {
  filename: string;
  originalName: string;
  preview: string;
  category: "before" | "during" | "after" | "other";
}

export default function InspectPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [result, setResult] = useState<"OK" | "REPAIR_NEEDED" | "">("");
  const [workDates, setWorkDates] = useState<string[]>([""]);

  // 最終日（最も遅い日付）を完了日・請求日の基準とする
  const finalWorkDate = workDates.filter(Boolean).sort().at(-1) ?? "";
  const addWorkDate = () => setWorkDates([...workDates, ""]);
  const removeWorkDate = (i: number) => setWorkDates(workDates.filter((_, idx) => idx !== i));
  const setWorkDate = (i: number, v: string) => setWorkDates(workDates.map((d, idx) => idx === i ? v : d));

  // 詳細内容テンプレート（4セクション）
  const [situation, setSituation] = useState("");
  const [cause, setCause] = useState("");
  const [response, setResponse] = useState("");
  const [other, setOther] = useState("");

  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState<"before" | "during" | "after" | "other" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState("");

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: "before" | "during" | "after" | "other") => {
    const files = e.target.files;
    if (!files) return;

    setUploading(category);
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
            category,
          });
        } else {
          setUploadError(`アップロード失敗 (${file.name}, status:${res.status})`);
        }
      } catch (e) {
        setUploadError(`エラー: ${String(e)} (${file.name})`);
      }
    }

    setPhotos((prev) => [...prev, ...uploaded]);
    setUploading(null);
    e.target.value = "";
  };

  const removePhoto = (filename: string) => {
    setPhotos((prev) => prev.filter((p) => p.filename !== filename));
  };

  // 4セクションを1つの文字列に結合
  const buildNotes = () =>
    `【状況】\n${situation.trim()}\n\n【原因】\n${cause.trim()}\n\n【対応】\n${response.trim()}${other.trim() ? `\n\n【その他】\n${other.trim()}` : ""}`;

  const canSubmit = !!result && !!finalWorkDate && situation.trim() && cause.trim() && response.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    await fetch(`/api/projects/${id}/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result,
        workDate: finalWorkDate,
        workDates: workDates.filter(Boolean).sort(),
        notes: buildNotes(),
        photos: photos.map((p) => ({ filename: p.filename, originalName: p.originalName, category: p.category })),
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

          {/* 作業日（複数日対応） */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-gray-700">作業日 *</label>
              <button
                type="button"
                onClick={addWorkDate}
                className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50 transition"
              >
                ＋ 日付を追加
              </button>
            </div>
            <div className="space-y-2">
              {workDates.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={d}
                    onChange={(e) => setWorkDate(i, e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {workDates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeWorkDate(i)}
                      className="text-gray-400 hover:text-red-500 text-sm px-2"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
            {workDates.filter(Boolean).length > 1 && (
              <p className="text-xs text-gray-500 mt-2">
                最終日（完了日）: <span className="font-medium text-gray-700">{new Date(finalWorkDate).toLocaleDateString("ja-JP")}</span>
              </p>
            )}
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

          {/* 写真（3セクション） */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <p className="text-sm font-bold text-gray-700">作業写真</p>
            {(["before", "during", "after", "other"] as const).map((cat) => {
              const labels = { before: "点検前", during: "点検中", after: "点検後", other: "その他" };
              const catPhotos = photos.filter((p) => p.category === cat);
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-gray-600 mb-2">{labels[cat]}</p>
                  <label className={`flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl py-3 cursor-pointer transition ${uploading === cat ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"}`}>
                    <span className="text-xl">📷</span>
                    <span className="text-sm text-gray-600">
                      {uploading === cat ? "アップロード中..." : "写真を選択（複数可）"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e, cat)}
                      disabled={uploading !== null}
                    />
                  </label>
                  {catPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {catPhotos.map((photo) => (
                        <div key={photo.filename} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.preview} alt={photo.originalName} className="w-full h-24 object-cover rounded-lg" />
                          <button
                            type="button"
                            onClick={() => removePhoto(photo.filename)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {uploadError && <p className="text-xs text-red-500 break-all">{uploadError}</p>}
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
