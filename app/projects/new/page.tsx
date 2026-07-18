"use client";

import { useEffect, useState, useRef } from "react";
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
  const [workTypeMasters, setWorkTypeMasters] = useState<{ id: string; name: string; defaultAmount: number | null; defaultSales?: number | null; defaultUrgency: string | null; defaultSimpleReport?: boolean }[]>([]);
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
    materialSupplied: false,
    simpleReport: false,
    amount: "",
    salesAmount: "",
    materialCost: "",
    dueDate: "",
    parkingInfo: "",
    region: "",
    contactRequired: false,
    assignedToId: "",
    preferredContactAt: "",
    preferredVisitAt: "",
    moveInDate: "",
    receivedAt: "",
    managerName: "",
    afterManagerName: "",
  });
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const extractFileRef = useRef<File | null>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [intakeDoc, setIntakeDoc] = useState<{ url: string; name: string; isPdf: boolean; objUrl: string | null } | null>(null); // 原本プレビュー
  const [showDocMobile, setShowDocMobile] = useState(false);

  // 読み取り結果をフォームに反映（空文字は既存値を残す）
  const applyExtracted = (d: Record<string, unknown>) => {
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    setForm((prev) => ({
      ...prev,
      title: s(d.title) || prev.title,
      location: s(d.location) || prev.location,
      roomNumber: s(d.roomNumber) || prev.roomNumber,
      contractorName: s(d.contractorName) || prev.contractorName,
      contractorPhone: s(d.contractorPhone) || prev.contractorPhone,
      description: s(d.description) || prev.description,
      moveInDate: s(d.moveInDate) || prev.moveInDate,
      preferredContactAt: s(d.preferredContactAt) || prev.preferredContactAt,
      receivedAt: s(d.receivedAt) || prev.receivedAt,
      managerName: s(d.managerName) || prev.managerName,
      afterManagerName: s(d.afterManagerName) || prev.afterManagerName,
      smsAllowed: typeof d.smsAllowed === "boolean" ? d.smsAllowed : prev.smsAllowed,
      contactRequired: typeof d.contactRequired === "boolean" ? d.contactRequired : prev.contactRequired,
      region: (() => {
        const r = s(d.region);
        if (r === "埼玉" || r === "北関東") return r;
        // 住所から判定（埼玉県→埼玉、栃木/茨城/群馬→北関東）
        const loc = s(d.location);
        if (loc.includes("埼玉")) return "埼玉";
        if (/栃木|茨城|群馬/.test(loc)) return "北関東";
        return prev.region;
      })(),
    }));
    const filled = ["title", "location", "roomNumber", "contractorName", "contractorPhone", "receivedAt", "description"].filter((k) => s(d[k])).length;
    setExtractMsg(filled > 0 ? `✓ ${filled}項目を読み取りました。内容を確認して登録してください` : "読み取れる項目が見つかりませんでした");
  };

  const runExtract = async (file: File) => {
    if (!file) return;
    extractFileRef.current = file;
    // PDF・画像のみ受け付け
    const ok = file.type === "application/pdf" || file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".pdf");
    if (!ok) {
      setExtractMsg("PDFまたは画像を指定してください");
      return;
    }
    setExtracting(true);
    setExtractMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/projects/extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setExtractMsg(json.error ? `読み取りに失敗しました：${json.error}` : "読み取りに失敗しました");
        return;
      }
      applyExtracted(json.data || {});
    } catch (e) {
      setExtractMsg("読み取りに失敗しました：" + (e instanceof Error ? e.message : "通信エラー"));
    } finally {
      setExtracting(false);
    }
  };

  // URL（リンク）から読み取り
  const runExtractUrl = async (url: string) => {
    setExtracting(true);
    setExtractMsg("");
    try {
      const res = await fetch("/api/projects/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setExtractMsg((json.error || "読み取りに失敗しました") + "（リンクからは取得できないことがあります。画面をコピーして貼り付けてください）");
        return;
      }
      applyExtracted(json.data || {});
    } catch {
      setExtractMsg("読み取りに失敗しました");
    } finally {
      setExtracting(false);
    }
  };

  const handleExtract = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) runExtract(file);
  };

  const extractFileFromDrop = (dt: DataTransfer): File | null => {
    // files が空でも items 経由で取れる場合がある
    if (dt.files && dt.files.length > 0) return dt.files[0];
    if (dt.items) {
      for (const it of Array.from(dt.items)) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) return f;
        }
      }
    }
    return null;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (extracting) return;
    const file = extractFileFromDrop(e.dataTransfer);
    if (file) { runExtract(file); return; }
    // ファイルが取れない場合はURL（リンク）を試す
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (/^https?:\/\//.test(url)) { runExtractUrl(url.split("\n")[0].trim()); return; }
    setExtractMsg("このドラッグ元からはファイルを取得できませんでした。画面をコピーして貼り付ける（⌘/Ctrl+V）か「ファイルを選ぶ」を使ってください");
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (extracting) return;
    const item = Array.from(e.clipboardData.items).find(
      (it) => it.type === "application/pdf" || it.type.startsWith("image/")
    );
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      runExtract(file);
    }
  };

  const role = (session?.user as { role?: string })?.role;
  const myId = (session?.user as { id?: string })?.id;
  const myName = session?.user?.name;
  const isSelf = !!myId && form.assignedToId === myId; // 自分施工の案件

  // 受付ボックスからの振り分け：?intake=ID の依頼書を自動で読み取り
  useEffect(() => {
    if (status !== "authenticated") return;
    const params = new URLSearchParams(window.location.search);
    const iid = params.get("intake");
    if (!iid) return;
    (async () => {
      try {
        const r = await fetch(`/api/intake?id=${iid}`);
        if (!r.ok) return;
        const doc = await r.json();
        setIntakeId(doc.id);
        setExtractMsg("受付ボックスの依頼書を読み取っています…");
        const fr = await fetch(doc.filename);
        const blob = await fr.blob();
        const isImage = blob.type.startsWith("image/");
        const typed = blob.type ? blob : new Blob([blob], { type: "application/pdf" });
        setIntakeDoc({
          url: doc.filename,
          name: doc.originalName || "依頼書",
          isPdf: !isImage,
          objUrl: URL.createObjectURL(typed),
        });
        const file = new File([blob], doc.originalName || "依頼書.pdf", { type: blob.type || "application/pdf" });
        runExtract(file);
      } catch {
        setExtractMsg("受付ボックスの依頼書の取得に失敗しました");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 受付日時の初期値＝フォームを開いた日時（PDF読み取りで上書きされる）
  useEffect(() => {
    const now = new Date();
    const v = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setForm((prev) => (prev.receivedAt ? prev : { ...prev, receivedAt: v }));
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  // ページ外にドロップしてもブラウザがPDFを開かないようにする（ドロップ範囲を実質ページ全体に）
  useEffect(() => {
    const onOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      if (extracting) return;
      const dt = e.dataTransfer;
      if (!dt) return;
      let file: File | null = dt.files && dt.files.length > 0 ? dt.files[0] : null;
      if (!file && dt.items) {
        for (const it of Array.from(dt.items)) {
          if (it.kind === "file") { const f = it.getAsFile(); if (f) { file = f; break; } }
        }
      }
      if (file) { runExtract(file); return; }
      const url = dt.getData("text/uri-list") || dt.getData("text/plain");
      if (/^https?:\/\//.test(url)) runExtractUrl(url.split("\n")[0].trim());
    };
    // ページのどこで貼り付けても読み取る（入力欄にフォーカス中は除く）
    const onPaste = (e: ClipboardEvent) => {
      if (extracting) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === "file" && (it.type === "application/pdf" || it.type.startsWith("image/"))) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); runExtract(f); return; }
        }
      }
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extracting]);

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

    // 自社案件で物件名が空の場合は自動命名（一覧表示が空にならないように）
    const payload = { ...form };
    if (isSelf && !payload.title.trim()) {
      const now = new Date();
      payload.title = payload.workType.trim() || `自社案件 ${now.getMonth() + 1}/${now.getDate()}`;
    }

    // 自社施工の場合：AI読み取りに使った依頼書の原本を自動で添付（協力会社には渡らないため安全）
    let allPhotos = photos.map((p) => ({ filename: p.filename, originalName: p.originalName }));
    if (form.assignedToId === myId && extractFileRef.current) {
      try {
        const fd = new FormData();
        fd.append("file", extractFileRef.current);
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (up.ok) {
          const j = await up.json();
          allPhotos = [...allPhotos, { filename: j.filename, originalName: `【依頼書原本】${j.originalName || "依頼書.pdf"}` }];
        }
      } catch { /* 添付失敗しても登録は続行 */ }
    }

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        // 自社案件は自分で登録＝受注済みなので、最初から受注状態にする
        ...(isSelf ? { status: "ACCEPTED" } : {}),
        photos: allPhotos,
      }),
    });

    if (res.ok) {
      // 受付ボックス経由なら振り分け済みにする
      if (intakeId) {
        try {
          const created = await res.json().catch(() => null);
          await fetch("/api/intake", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: intakeId, projectId: created?.id || null }),
          });
        } catch { /* ignore */ }
      }
      router.push("/dashboard");
    } else {
      setLoading(false);
    }
  };

  const inputClass = "w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500";

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
      <Header />
      <main className={`flex-1 mx-auto w-full px-4 py-4 sm:py-6 ${intakeDoc ? "max-w-lg lg:max-w-7xl" : "max-w-lg lg:max-w-2xl"}`}>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white">←</button>
          <h2 className="text-lg font-bold text-white">新規依頼登録</h2>
        </div>

        <div className={intakeDoc ? "lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start" : ""}>

        {/* 📄 依頼書原本（振り分け時）: PCは左に常時表示・モバイルは開閉 */}
        {intakeDoc && (
          <div className="mb-4 lg:mb-0 lg:sticky lg:top-4 lg:order-2">
            <div className="bg-gray-800 border border-sky-700 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-sky-800/60">
                <span className="shrink-0">📄</span>
                <span className="text-sm font-bold text-sky-300 truncate flex-1 min-w-0">{intakeDoc.name}</span>
                <a href={intakeDoc.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-sky-400 border border-sky-700 rounded-lg px-2.5 py-1 hover:bg-sky-900/40 transition shrink-0">
                  別タブで開く
                </a>
                <button type="button" onClick={() => setShowDocMobile((v) => !v)}
                  className="lg:hidden text-xs text-sky-400 px-1.5 shrink-0">
                  {showDocMobile ? "▲ 閉じる" : "▼ 表示"}
                </button>
              </div>
              <div className={`${showDocMobile ? "block" : "hidden"} lg:block`}>
                {intakeDoc.isPdf ? (
                  <iframe src={intakeDoc.objUrl || intakeDoc.url} title="依頼書原本"
                    className="w-full h-[60vh] lg:h-[calc(100vh-9rem)] bg-white" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={intakeDoc.objUrl || intakeDoc.url} alt="依頼書原本" className="w-full max-h-[70vh] lg:max-h-[calc(100vh-9rem)] object-contain bg-gray-950" />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="min-w-0 lg:order-1">

        {/* まず担当を決める */}
        <div className={`rounded-xl border p-4 mb-4 ${form.assignedToId ? "bg-gray-800 border-gray-700" : "bg-gray-800 border-blue-600"}`}>
          <label className="block text-sm font-bold text-gray-100 mb-2">① まず担当を選ぶ *</label>
          <select required value={form.assignedToId}
            onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
            className={inputClass}>
            <option value="">担当を選択してください</option>
            {myId && <option value={myId}>🔧 自分で施工（{myName || "管理者"}）</option>}
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.companyName || p.name}</option>
            ))}
          </select>
          {form.assignedToId === myId && (
            <p className="text-xs text-amber-300 mt-2">🔧 自分施工：依頼書の原本が自動添付され、以下の項目は<span className="font-bold">すべて任意</span>になります（空欄でも登録OK）</p>
          )}
        </div>

        {/* PDF/写真から自動入力（AI読み取り） */}
        <div
          className={`rounded-xl border p-4 mb-4 transition ${dragOver ? "bg-blue-800/50 border-blue-400 border-dashed" : "bg-gradient-to-br from-blue-900/40 to-indigo-900/30 border-blue-700/60"}`}
          onDragOver={(e) => { e.preventDefault(); if (!extracting) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
          <p className="text-sm font-bold text-blue-200 mb-1">② 依頼書から自動入力</p>
          <p className="text-xs text-blue-300/80 mb-3">
            依頼書を<span className="font-bold text-blue-200">ドラッグ&ドロップ</span>／<span className="font-bold text-blue-200">貼り付け（⌘/Ctrl+V）</span>／ファイル選択のいずれかで、AIが物件名・住所などを自動入力します。
            <br />
            <span className="text-blue-300">💡 ドラッグできない時は、依頼書を画面に出して<span className="font-bold text-blue-200">スクショをコピー→この画面で貼り付け</span>が確実です（Macは ⌘⇧4＋Ctrl、Winは Win＋Shift＋S）。</span>
          </p>
          <label className={`block w-full text-center text-sm rounded-lg py-2.5 font-medium border cursor-pointer transition ${extracting ? "bg-gray-700 text-gray-400 border-gray-600" : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"}`}>
            {extracting ? "読み取り中… 少々お待ちください" : dragOver ? "ここにドロップ" : "＋ ファイルを選ぶ / ドラッグ / 貼り付け"}
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={extracting}
              onChange={handleExtract}
            />
          </label>
          {extractMsg && <p className="text-xs mt-2 text-center text-blue-200">{extractMsg}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}>

          {/* 物件情報 */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="bg-gray-800/60 px-4 py-2 border-b border-gray-700">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">物件情報</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">物件名 *</label>
                <input type="text" required={!isSelf} value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={inputClass} placeholder="例: ○○ビル" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">住所 *</label>
                <input type="text" required={!isSelf} value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className={inputClass} placeholder="例: 東京都渋谷区○○1-2-3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">号室 <span className="text-gray-500 font-normal">（任意）</span></label>
                <input type="text" value={form.roomNumber}
                  onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
                  className={inputClass} placeholder="例: 101号室" />
              </div>
            </div>
          </div>

          {/* 契約者情報 */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="bg-gray-800/60 px-4 py-2 border-b border-gray-700">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">契約者情報</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">受付日時 <span className="text-gray-500 font-normal text-xs">（任意）</span></label>
                <input type="text" value={form.receivedAt}
                  onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
                  className={inputClass} placeholder="例: 7/10 10:30" maxLength={20} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1">管理担当者名</label>
                  <input type="text" value={form.managerName}
                    onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                    className={inputClass} placeholder="依頼元の管理担当" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1">アフター担当者名</label>
                  <input type="text" value={form.afterManagerName}
                    onChange={(e) => setForm({ ...form, afterManagerName: e.target.value })}
                    className={inputClass} placeholder="アフター担当" />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-1">🔒 担当者名は協力会社には表示されません</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1">折り返し先名カナ</label>
                  <input type="text" value={form.contractorName}
                    onChange={(e) => setForm({ ...form, contractorName: e.target.value })}
                    className={inputClass} placeholder="例: ヤマダ タロウ" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1">折り返し先電話番号</label>
                  <input type="tel" value={form.contractorPhone}
                    onChange={(e) => setForm({ ...form, contractorPhone: e.target.value })}
                    className={inputClass} placeholder="090-1234-5678" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">ショートメールでの連絡</label>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setForm({ ...form, smsAllowed: true })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      form.smsAllowed
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-gray-700 text-gray-300 border-gray-600 hover:border-blue-400"
                    }`}>可</button>
                  <button type="button"
                    onClick={() => setForm({ ...form, smsAllowed: false })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      !form.smsAllowed
                        ? "bg-gray-600 text-white border-gray-600"
                        : "bg-gray-700 text-gray-300 border-gray-600 hover:border-gray-400"
                    }`}>不可</button>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                <p className="text-sm font-medium text-gray-300">入居者への連絡・訪問希望 <span className="text-gray-500 font-normal text-xs">（任意）</span></p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">連絡希望日時</label>
                    <input type="text" value={form.preferredContactAt}
                      onChange={(e) => setForm({ ...form, preferredContactAt: e.target.value })}
                      className={inputClass}
                      placeholder="例: 5/10 午前中" maxLength={15} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">訪問希望日時</label>
                    <input type="text" value={form.preferredVisitAt}
                      onChange={(e) => setForm({ ...form, preferredVisitAt: e.target.value })}
                      className={inputClass}
                      placeholder="例: 5/12 14時以降" maxLength={15} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">入居開始日 <span className="text-gray-500 font-normal text-xs">（任意）</span></label>
                <input type="text" value={form.moveInDate}
                  onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
                  className={inputClass}
                  placeholder="例: R7.6.1" maxLength={12} />
              </div>
            </div>
          </div>

          {/* 依頼内容 */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="bg-gray-800/60 px-4 py-2 border-b border-gray-700">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">依頼内容</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-300 mb-1">依頼名 *</label>
                <div className="flex">
                  <input type="text" required={!isSelf} value={form.workType}
                    onChange={(e) => setForm({ ...form, workType: e.target.value })}
                    onFocus={() => setShowWorkTypeList(false)}
                    className="flex-1 border border-gray-600 rounded-l-lg px-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                    placeholder="例: 電気設備点検・漏電調査・エアコン修理" />
                  {workTypeMasters.length > 0 && (
                    <button type="button"
                      onClick={() => setShowWorkTypeList((v) => !v)}
                      className="border border-l-0 border-gray-600 rounded-r-lg px-2.5 bg-gray-600 hover:bg-gray-500 text-gray-300 transition">
                      ▼
                    </button>
                  )}
                </div>
                {showWorkTypeList && workTypeMasters.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {workTypeMasters.map((w) => (
                      <button key={w.id} type="button"
                        onMouseDown={() => {
                      setForm({
                        ...form,
                        workType: w.name,
                        ...(w.defaultAmount != null ? { amount: String(w.defaultAmount) } : {}),
                        ...(w.defaultUrgency ? { urgency: w.defaultUrgency } : {}),
                        ...(w.defaultSales != null ? { salesAmount: String(w.defaultSales) } : {}),
                        simpleReport: !!w.defaultSimpleReport,
                      });
                      setShowWorkTypeList(false);
                    }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 hover:text-white transition border-b border-gray-700 last:border-0">
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">依頼内容</label>
                <textarea value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3} className={inputClass} placeholder="作業の詳細や注意事項など" />
              </div>
              {!isSelf && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">金額【税別】</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
                  <input type="text" inputMode="numeric" value={form.amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
                      setForm({ ...form, amount: v });
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
                      setForm({ ...form, amount: v });
                    }}
                    className="w-full border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0" />
                </div>
              </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">売上（積水請求・税別）<span className="text-gray-500 font-normal text-xs ml-1">協力会社には表示されません</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
                  <input type="text" inputMode="numeric" value={form.salesAmount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
                      setForm({ ...form, salesAmount: v });
                    }}
                    className="w-full border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">材料費（税別）<span className="text-gray-500 font-normal text-xs ml-1">材料支給時など。協力会社には表示されません</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
                  <input type="text" inputMode="numeric" value={form.materialCost}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
                      setForm({ ...form, materialCost: v });
                    }}
                    className="w-full border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">緊急度</label>
                <div className="flex gap-2">
                  {[
                    { value: "LOW", label: "低", active: "bg-green-600 text-white border-green-600", hover: "hover:border-green-500" },
                    { value: "MEDIUM", label: "中", active: "bg-yellow-500 text-white border-yellow-500", hover: "hover:border-yellow-500" },
                    { value: "HIGH", label: "高", active: "bg-red-600 text-white border-red-600", hover: "hover:border-red-500" },
                  ].map(({ value, label, active, hover }) => (
                    <button key={value} type="button"
                      onClick={() => setForm({ ...form, urgency: value })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                        form.urgency === value ? active : `bg-gray-700 text-gray-300 border-gray-600 ${hover}`
                      }`}>{label}</button>
                  ))}
                </div>
              </div>
              {!isSelf && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">材料支給</label>
                <button type="button"
                  onClick={() => setForm({ ...form, materialSupplied: !form.materialSupplied })}
                  className={`w-full py-2 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${
                    form.materialSupplied
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-gray-700 text-gray-300 border-gray-600 hover:border-teal-500"
                  }`}>
                  📦 {form.materialSupplied ? "材料支給あり" : "材料支給なし"}
                </button>
              </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">完了報告のタイプ</label>
                <button type="button"
                  onClick={() => setForm({ ...form, simpleReport: !form.simpleReport })}
                  className={`w-full py-2 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${
                    form.simpleReport
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-gray-700 text-gray-300 border-gray-600 hover:border-emerald-500"
                  }`}>
                  {form.simpleReport ? "📝 簡易報告でOK（定型作業）" : "📋 詳細報告（状況・原因まで）"}
                </button>
                <p className="text-xs text-gray-500 mt-1">依頼名マスターで設定しておくと自動で切り替わります</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">駐車場空き区画 <span className="text-gray-500 font-normal text-xs">（任意）</span></label>
                <input type="text" value={form.parkingInfo}
                  onChange={(e) => setForm({ ...form, parkingInfo: e.target.value })}
                  className={inputClass} placeholder="例: 12番・来客用" maxLength={30} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">入居者アポイント <span className="text-gray-500 font-normal text-xs">（AI読み取りで自動判定）</span></label>
                <button type="button"
                  onClick={() => setForm({ ...form, contactRequired: !form.contactRequired })}
                  className={`w-full py-2 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${
                    form.contactRequired
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-gray-700 text-gray-300 border-gray-600 hover:border-red-500"
                  }`}>
                  📞 {form.contactRequired ? "アポイント必要" : "アポイント不要"}
                </button>
                {form.contactRequired && (
                  <p className="text-xs text-red-400 mt-1">アポが取れるまで「要対応」に表示されます</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">エリア <span className="text-gray-500 font-normal text-xs">（AI読み取りで自動判定）</span></label>
                <div className="flex gap-2">
                  {["埼玉", "北関東"].map((r) => (
                    <button key={r} type="button"
                      onClick={() => setForm({ ...form, region: form.region === r ? "" : r })}
                      className={`flex-1 py-2 text-sm rounded-lg border transition font-medium ${form.region === r ? "bg-blue-600 text-white border-blue-600" : "bg-gray-700 text-gray-300 border-gray-600 hover:border-blue-400"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 添付ファイル */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">現場写真・PDF</label>
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-600 rounded-xl py-4 cursor-pointer hover:border-blue-500 hover:bg-blue-900/10 transition">
              <span className="text-2xl">📎</span>
              <span className="text-sm text-gray-400">
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
                  <div key={pdf.filename} className="flex items-center justify-between bg-gray-700 border border-gray-600 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-200 flex items-center gap-2">
                      <span>📄</span>{pdf.originalName}
                    </span>
                    <button type="button"
                      onClick={() => setPhotos((prev) => prev.filter((p) => p.filename !== pdf.filename))}
                      className="text-red-400 text-xs hover:text-red-300">
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
        </div>
        </div>
      </main>
    </div>
  );
}
