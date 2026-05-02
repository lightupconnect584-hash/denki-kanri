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
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    const uploaded: UploadedPhoto[] = [];

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        uploaded.push({
          filename: data.filename,
          originalName: data.originalName,
          preview: URL.createObjectURL(file),
        });
      }
    }

    setPhotos((prev) => [...prev, ...uploaded]);
    setUploading(false);
  };

  const removePhoto = (filename: string) => {
    setPhotos((prev) => prev.filter((p) => p.filename !== filename));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;

    setSubmitting(true);
    await fetch(`/api/projects/${id}/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result,
        notes,
        photos: photos.map((p) => ({ filename: p.filename, originalName: p.originalName })),
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
          <h2 className="text-lg font-bold text-gray-800">点検結果を報告</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 点検結果 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-bold text-gray-700 mb-3">点検結果 *</label>
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

          {/* 写真 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-bold text-gray-700 mb-3">
              点検写真
            </label>
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-xl py-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
              <span className="text-2xl">📷</span>
              <span className="text-sm text-gray-600">
                {uploading ? "アップロード中..." : "写真を選択（複数可）"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
                disabled={uploading}
              />
            </label>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {photos.map((photo) => (
                  <div key={photo.filename} className="relative">
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

          {/* 備考 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              コメント・備考
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="点検の詳細や気になった点など"
            />
          </div>

          <button
            type="submit"
            disabled={!result || submitting}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {submitting ? "送信中..." : "点検結果を送信する"}
          </button>
        </form>
      </main>
    </div>
  );
}
