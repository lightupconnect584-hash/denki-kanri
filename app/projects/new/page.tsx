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
  const [workTypeMasters, setWorkTypeMasters] = useState<{ id: string; name: string; defaultAmount: number | null; defaultUrgency: string | null }[]>([]);
  const [showWorkTypeList, setShowWorkTypeList] = useState(false);
  const [form, setForm] = useState({
    title: "",
    location: "",
    roomNumber: "",
    workType: "",
    contractorName: "",
    contractorPhone: "",
    smsAllowed: false,
    description: "",
    urgency: "LOW",
    amount: "",
    dueDate: "",
    assignedToId: "",
    preferredContactAt: "",
    preferredVisitAt: "",
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
      fetch("/api/work-types").then((r) => r.json()).then(setWorkTypeMasters);
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
          <h2 className="text-lg font-bold text-white">新規依頼登録</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* 物件情報 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">物件情報</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">物件名 *</label>
                <input type="text" required value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={inputClass} placeholder="例: ○○ビル" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">住所 *</label>
                <input type="text" required value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className={inputClass} placeholder="例: 東京都渋谷区○○1-2-3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">号室 <span className="text-gray-400 font-normal">（任意）</span></label>
                <input type="text" value={form.roomNumber}
                  onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
                  className={inputClass} placeholder="例: 101号室" />
              </div>
            </div>
          </div>

          {/* 契約者情報 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">契約者情報</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">契約者名</label>
                  <input type="text" value={form.contractorName}
                    onChange={(e) => setForm({ ...form, contractorName: e.target.value })}
                    className={inputClass} placeholder="例: 山田 太郎" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">連絡先</label>
                  <input type="tel" value={form.contractorPhone}
                    onChange={(e) => setForm({ ...form, contractorPhone: e.target.value })}
                    className={inputClass} placeholder="090-1234-5678" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">ショートメールでの連絡</label>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setForm({ ...form, smsAllowed: true })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      form.smsAllowed
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                    }`}>可</button>
                  <button type="button"
                    onClick={() => setForm({ ...form, smsAllowed: false })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      !form.smsAllowed
                        ? "bg-gray-600 text-white border-gray-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                    }`}>不可</button>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                <p className="text-sm font-medium text-gray-700">入居者への連絡・訪問希望 <span className="text-gray-400 font-normal text-xs">（任意）</span></p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">連絡希望日時</label>
                    <input type="text" value={form.preferredContactAt}
                      onChange={(e) => setForm({ ...form, preferredContactAt: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: 5/10 午前中" maxLength={15} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">訪問希望日時</label>
                    <input type="text" value={form.preferredVisitAt}
                      onChange={(e) => setForm({ ...form, preferredVisitAt: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: 5/12 14時以降" maxLength={15} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 依頼内容 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">依頼内容</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">依頼名 *</label>
                <div className="flex">
                  <input type="text" required value={form.workType}
                    onChange={(e) => setForm({ ...form, workType: e.target.value })}
                    onFocus={() => setShowWorkTypeList(false)}
                    className="flex-1 border border-gray-300 rounded-l-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例: 電気設備点検・漏電調査・エアコン修理" />
                  {workTypeMasters.length > 0 && (
                    <button type="button"
                      onClick={() => setShowWorkTypeList((v) => !v)}
                      className="border border-l-0 border-gray-300 rounded-r-lg px-2.5 bg-gray-50 hover:bg-gray-100 text-gray-500 transition">
                      ▼
                    </button>
                  )}
                </div>
                {showWorkTypeList && workTypeMasters.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {workTypeMasters.map((w) => (
                      <button key={w.id} type="button"
                        onMouseDown={() => {
                      setForm({
                        ...form,
                        workType: w.name,
                        ...(w.defaultAmount != null ? { amount: String(w.defaultAmount) } : {}),
                        ...(w.defaultUrgency ? { urgency: w.defaultUrgency } : {}),
                      });
                      setShowWorkTypeList(false);
                    }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition border-b border-gray-50 last:border-0">
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">依頼内容</label>
                <textarea value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3} className={inputClass} placeholder="作業の詳細や注意事項など" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">金額【税別】</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">¥</span>
                  <input type="text" inputMode="numeric" value={form.amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
                      setForm({ ...form, amount: v });
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
                      setForm({ ...form, amount: v });
                    }}
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">緊急度</label>
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
                      }`}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">期日</label>
                <input type="date" value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className={inputClass} />
              </div>
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
            </div>
          </div>

          {/* 添付ファイル */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
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
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm">
            {loading ? "登録中..." : "依頼を登録する"}
          </button>
        </form>
      </main>
    </div>
  );
}
