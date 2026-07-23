"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface ManageData {
  id: string;
  title: string;
  clientName: string | null;
  sekisuiNumber: string | null;
  managerName: string | null;
  afterManagerName: string | null;
  salesAmount: number | null;
  materialCost: number | null;
  memo: string | null;
  intake: { id: string; originalName: string } | null;
  attachedOriginals: { id: string; filename: string; originalName: string }[];
}

const numClean = (v: string) =>
  v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");

export default function ManagePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sekisuiNumber, setSekisuiNumber] = useState("");
  const [managerName, setManagerName] = useState("");
  const [afterManagerName, setAfterManagerName] = useState("");
  const [salesAmount, setSalesAmount] = useState("");
  const [materialCost, setMaterialCost] = useState("");
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);

  const fetchData = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}/manage`);
    if (r.status === 404 || r.status === 401) { setNotFound(true); setLoading(false); return; }
    const d: ManageData = await r.json();
    setData(d);
    setSekisuiNumber(d.sekisuiNumber || "");
    setManagerName(d.managerName || "");
    setAfterManagerName(d.afterManagerName || "");
    setSalesAmount(d.salesAmount != null ? String(d.salesAmount) : "");
    setMaterialCost(d.materialCost != null ? String(d.materialCost) : "");
    setMemo(d.memo || "");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") fetchData();
  }, [status, fetchData, router]);

  const save = async (fields: Record<string, unknown>) => {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const openDoc = (url: string, label: string) => setViewer({ url, label });

  if (loading || status === "loading") {
    return <div className="min-h-full flex items-center justify-center bg-gray-900"><p className="text-gray-400">読み込み中...</p></div>;
  }
  if (notFound || !data) {
    return (
      <div className="min-h-full flex flex-col bg-gray-900">
        <Header />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-4xl mb-3">🔒</p>
            <p className="text-gray-300">この管理ページは表示できません</p>
            <Link href="/dashboard" className="inline-block mt-4 text-sm text-blue-400">依頼一覧へ</Link>
          </div>
        </div>
      </div>
    );
  }

  const inputClass = "w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-full flex flex-col bg-gray-900">
      <Header />
      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={() => setViewer(null)}>
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-950/90 shrink-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-100 truncate flex-1 min-w-0">📄 {viewer.label}</p>
            <a href={viewer.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 border border-sky-700 rounded-lg px-3 py-1.5 hover:bg-sky-900/40 shrink-0">別タブで開く</a>
            <button onClick={() => setViewer(null)} className="text-gray-400 hover:text-white text-xl px-2 shrink-0">✕</button>
          </div>
          <iframe src={viewer.url} title="依頼書原本" className="flex-1 min-h-0 bg-white" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      <main className="flex-1 max-w-lg lg:max-w-2xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <h2 className="text-lg font-bold text-white flex-1 min-w-0 truncate">🔒 管理ページ</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">{data.clientName || ""}｜{data.title}<br />このページの情報は協力会社には表示されません。</p>

        {/* 依頼書原本 */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-3">
          <p className="text-sm font-bold text-gray-100 mb-3">📄 依頼書原本</p>
          {!data.intake && data.attachedOriginals.length === 0 ? (
            <p className="text-xs text-gray-500">紐づいた依頼書原本はありません</p>
          ) : (
            <div className="space-y-2">
              {data.intake && (
                <button onClick={() => openDoc(`/api/intake/view?id=${data.intake!.id}`, data.intake!.originalName)}
                  className="flex items-center gap-2 w-full text-left text-sm text-sky-300 hover:text-sky-200 bg-gray-900/50 border border-sky-800 rounded-lg px-3 py-2 transition">
                  <span>📄</span><span className="truncate flex-1 min-w-0">{data.intake.originalName}</span><span className="text-sky-500">開く ›</span>
                </button>
              )}
              {data.attachedOriginals.map((ph) => (
                <button key={ph.id} onClick={() => openDoc(`/api/projects/${id}/photo-view?photo=${ph.id}`, ph.originalName)}
                  className="flex items-center gap-2 w-full text-left text-sm text-sky-300 hover:text-sky-200 bg-gray-900/50 border border-sky-800 rounded-lg px-3 py-2 transition">
                  <span>📄</span><span className="truncate flex-1 min-w-0">{ph.originalName.replace("【依頼書原本】", "")}</span><span className="text-sky-500">開く ›</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 積水受付番号 */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-3">
          <p className="text-sm font-bold text-gray-100 mb-2">🔢 積水受付番号</p>
          <input value={sekisuiNumber} onChange={(e) => setSekisuiNumber(e.target.value)} onBlur={() => save({ sekisuiNumber })}
            className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="依頼書の受付番号（AI読み取りで自動入力）" />
          <p className="text-xs text-gray-500 mt-1.5">積水の依頼管理システムでこの番号を検索すると該当依頼を照合できます</p>
        </div>

        {/* 担当者 */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-3 space-y-3">
          <p className="text-sm font-bold text-gray-100">担当者（依頼元）</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">管理担当者名</label>
            <input value={managerName} onChange={(e) => setManagerName(e.target.value)} onBlur={() => save({ managerName })} className={inputClass} placeholder="依頼元の管理担当" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">アフター担当者名</label>
            <input value={afterManagerName} onChange={(e) => setAfterManagerName(e.target.value)} onBlur={() => save({ afterManagerName })} className={inputClass} placeholder="アフター担当" />
          </div>
        </div>

        {/* 金額 */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-3 space-y-3">
          <p className="text-sm font-bold text-gray-100">金額</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">売上（積水請求・税別）</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
              <input inputMode="numeric" value={salesAmount ? Number(salesAmount).toLocaleString() : ""}
                onChange={(e) => setSalesAmount(numClean(e.target.value))}
                onBlur={() => save({ salesAmount })}
                className="w-full border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">材料費（税別）</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
              <input inputMode="numeric" value={materialCost ? Number(materialCost).toLocaleString() : ""}
                onChange={(e) => setMaterialCost(numClean(e.target.value))}
                onBlur={() => save({ materialCost })}
                className="w-full border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
            </div>
          </div>
        </div>

        {/* 管理メモ */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-3">
          <p className="text-sm font-bold text-gray-100 mb-2">📝 管理メモ</p>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} onBlur={() => save({ memo })} rows={4}
            className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" placeholder="この案件の管理メモ（協力会社には非公開）" />
        </div>

        {saved && <p className="text-xs text-green-400 text-center">✓ 保存しました</p>}
      </main>
    </div>
  );
}
