"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface Partner {
  id: string;
  name: string;
  companyName: string | null;
  role: string;
}

interface UploadedFile {
  filename: string;
  originalName: string;
  preview: string;
  isPdf: boolean;
}

export default function NewProjectPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState({
    title: "",
    location: "",
    contractorName: "",
    contractorPhone: "",
    smsAllowed: false,
    description: "",
    urgency: "LOW",
    amount: "",
    dueDate: "",
    assignedToId: "",
  });
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/users").then((r) => r.json()).then((data) => setPartners(data.filter((u: Partner) => u.role === "PARTNER")));
    }
  }, [status]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    const uploaded: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      try {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

        if (isPdf) {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json();
            uploaded.push({ filename: data.filename, originalName: data.originalName, preview: "", isPdf: true });
          }
        } else {
          const compressedFile = await new Promise<File>((resolve, reject) => {
            const img = new window.Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
              const MAX = 1920;
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
              }, "image/jpeg", 0.75);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("読み込み失敗")); };
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
              isPdf: false,
            });
          }
        }
      } catch {
        // skip
      }
    }
    setPhotos((prev) => [...prev, ...uploaded]);
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        photos: photos.map((p) => ({ filename: p.filename, originalName: p.originalName })),
      }),
    });

    if (res.ok) {
      router.push("/dashboard");
    } else {
      setLoading(false);
    }
  };

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white">←</button>
          <h2 className="text-lg font-bold text-white">新規案件登録</h2>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

          {/* 物件名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">物件名 *</label>
            <input type="text" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClass} placeholder="例: ○○ビル" />
          </div>

          {/* 住所 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">住所 *</label>
            <input type="text" required value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className={inputClass} placeholder="例: 東京都渋谷区○○1-2-3" />
          </div>

          {/* 契約者名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">契約者名</label>
            <input type="text" value={form.contractorName}
              onChange={(e) => setForm({ ...form, contractorName: e.target.value })}
              className={inputClass} placeholder="例: 山田 太郎" />
          </div>

          {/* 契約者連絡先 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">契約者連絡先</label>
            <input type="tel" value={form.contractorPhone}
              onChange={(e) => setForm({ ...form, contractorPhone: e.target.value })}
              className={inputClass} placeholder="例: 090-1234-5678" />
          </div>

          {/* ショートメール */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ショートメールでの連絡</label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setForm({ ...form, smsAllowed: true })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                  form.smsAllowed
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                }`}>
                可
              </button>
              <button type="button"
                onClick={() => setForm({ ...form, smsAllowed: false })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                  !form.smsAllowed
                    ? "bg-gray-600 text-white border-gray-600"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}>
                不可
              </button>
            </div>
          </div>

          {/* 依頼内容 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">依頼内容</label>
            <textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className={inputClass}
              placeholder="作業の詳細や注意事項など" />
          </div>

          {/* 緊急度 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">緊急度</label>
            <div className="flex gap-2">
              {[
                { value: "LOW", label: "低", active: "bg-green-600 text-white border-green-600", hover: "hover:border-green-400" },
                { value: "MEDIUM", label: "中", active: "bg-yellow-500 text-white border-yellow-500", hover: "hover:border-yellow-400" },
                { value: "HIGH", label: "高", active: "bg-red-600 text-white border-red-600", hover: "hover:border-red-400" },
              ].map(({ value, label, active, hover }) => (
                <button key={value} type="button"
                  onClick={() => setForm({ ...form, urgency: value })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    form.urgency === value ? active : `bg-white text-gray-600 border-gray-300 ${hover}`
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 金額 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額【税別】</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">¥</span>
              <input type="text" inputMode="numeric" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0" />
            </div>
          </div>

          {/* 期日 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">期日</label>
            <input type="date" value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={inputClass} />
          </div>

          {/* 担当協力会社 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">担当協力会社 *</label>
            <select required value={form.assignedToId}
              onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
              className={inputClass}>
              <option value=""></option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.companyName || p.name}</option>
              ))}
            </select>
          </div>

          {/* 添付ファイル */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">現場写真・PDF</label>
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-xl py-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
              <span className="text-2xl">📎</span>
              <span className="text-sm text-gray-600">
                {uploading ? "アップロード中..." : "写真・PDFを添付（複数可）"}
              </span>
              <input type="file" accept="image/*,application/pdf" multiple className="hidden"
                onChange={handleFileUpload} disabled={uploading} />
            </label>
            {photos.length > 0 && (
              <div className="mt-3 space-y-2">
                {photos.filter((p) => !p.isPdf).length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.filter((p) => !p.isPdf).map((photo) => (
                      <div key={photo.filename} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.preview} alt={photo.originalName}
                          className="w-full h-24 object-cover rounded-lg" />
                        <button type="button"
                          onClick={() => setPhotos((prev) => prev.filter((p) => p.filename !== photo.filename))}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photos.filter((p) => p.isPdf).map((pdf) => (
                  <div key={pdf.filename} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700 flex items-center gap-2">
                      <span>📄</span>{pdf.originalName}
                    </span>
                    <button type="button"
                      onClick={() => setPhotos((prev) => prev.filter((p) => p.filename !== pdf.filename))}
                      className="text-red-500 text-xs hover:text-red-700">
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" disabled={loading || uploading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? "登録中..." : "案件を登録する"}
          </button>
        </form>
      </main>
    </div>
  );
}
