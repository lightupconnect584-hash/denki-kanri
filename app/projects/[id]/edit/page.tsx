"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/Header";

interface Partner {
  id: string;
  name: string;
  companyName: string | null;
  role: string;
}

export default function EditProjectPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [partners, setPartners] = useState<Partner[]>([]);
  const [workTypeMasters, setWorkTypeMasters] = useState<{ id: string; name: string; defaultAmount: number | null; defaultSales?: number | null; defaultUrgency: string | null }[]>([]);
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
    assignedToId: "",
    preferredContactAt: "",
    preferredVisitAt: "",
    moveInDate: "",
    receivedAt: "",
    parkingInfo: "",
    region: "",
    managerName: "",
    afterManagerName: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const role = (session?.user as { role?: string })?.role;
  const myId = (session?.user as { id?: string })?.id;
  const myName = session?.user?.name;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/users").then((r) => r.json()).then((data) => setPartners(data.filter((u: Partner) => u.role === "PARTNER")));
      fetch("/api/work-types").then((r) => r.json()).then(setWorkTypeMasters);
      fetch(`/api/projects/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setForm({
            title: data.title || "",
            location: data.location || "",
            roomNumber: data.roomNumber || "",
            workType: data.workType || "",
            contractorName: data.contractorName || "",
            contractorPhone: data.contractorPhone || "",
            smsAllowed: data.smsAllowed ?? false,
            description: data.description || "",
            urgency: data.urgency || "LOW",
            materialSupplied: data.materialSupplied ?? false,
            amount: data.amount != null ? String(data.amount) : "",
            salesAmount: data.salesAmount != null ? String(data.salesAmount) : "",
            materialCost: data.materialCost != null ? String(data.materialCost) : "",
            dueDate: data.dueDate ? data.dueDate.slice(0, 10) : "",
            assignedToId: data.assignedTo?.id || "",
            preferredContactAt: data.preferredContactAt || "",
            preferredVisitAt: data.preferredVisitAt || "",
            moveInDate: data.moveInDate || "",
            receivedAt: data.receivedAt || "",
            parkingInfo: data.parkingInfo || "",
            region: data.region || "",
            managerName: data.managerName || "",
            afterManagerName: data.afterManagerName || "",
            simpleReport: data.simpleReport ?? false,
          });
          setLoading(false);
        });
    }
  }, [status, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      router.push(`/projects/${id}`);
    } else {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-gray-900">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  const inputClass = "w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-full flex flex-col bg-gray-900 [color-scheme:dark]">
      <Header />
      <main className="flex-1 max-w-lg lg:max-w-2xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white">←</button>
          <h2 className="text-lg font-bold text-white">依頼を編集</h2>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4" onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">物件名 *</label>
            <input type="text" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">住所 *</label>
            <input type="text" required value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">号室 <span className="text-gray-500 font-normal">（任意）</span></label>
            <input type="text" value={form.roomNumber}
              onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
              className={inputClass} placeholder="例: 101号室" />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-200 mb-1">依頼名 *</label>
            <div className="flex">
              <input type="text" required value={form.workType}
                onChange={(e) => setForm({ ...form, workType: e.target.value })}
                onFocus={() => setShowWorkTypeList(false)}
                className="flex-1 border border-gray-600 rounded-l-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例: 電気設備点検・漏電調査・エアコン修理" />
              {workTypeMasters.length > 0 && (
                <button type="button"
                  onClick={() => setShowWorkTypeList((v) => !v)}
                  className="border border-l-0 border-gray-600 rounded-r-lg px-2.5 bg-gray-700/40 hover:bg-gray-700 text-gray-400 transition">
                  ▼
                </button>
              )}
            </div>
            {showWorkTypeList && workTypeMasters.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {workTypeMasters.map((w) => (
                  <button key={w.id} type="button"
                    onMouseDown={() => {
                      setForm({
                        ...form,
                        workType: w.name,
                        ...(w.defaultAmount != null ? { amount: String(w.defaultAmount) } : {}),
                        ...(w.defaultSales != null ? { salesAmount: String(w.defaultSales) } : {}),
                        ...(w.defaultUrgency ? { urgency: w.defaultUrgency } : {}),
                      });
                      setShowWorkTypeList(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-blue-900/40 hover:text-blue-300 transition border-b border-gray-700 last:border-0">
                    {w.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">受付日時</label>
            <input type="text" value={form.receivedAt}
              onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
              className={inputClass} placeholder="例: 7/10 10:30" />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-200 mb-1">管理担当者名</label>
              <input type="text" value={form.managerName}
                onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                className={inputClass} placeholder="依頼元の管理担当" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-200 mb-1">アフター担当者名</label>
              <input type="text" value={form.afterManagerName}
                onChange={(e) => setForm({ ...form, afterManagerName: e.target.value })}
                className={inputClass} placeholder="アフター担当" />
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">🔒 担当者名は協力会社には表示されません</p>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">折り返し先名カナ</label>
            <input type="text" value={form.contractorName}
              onChange={(e) => setForm({ ...form, contractorName: e.target.value })}
              className={inputClass} placeholder="例: ヤマダ タロウ" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">折り返し先電話番号</label>
            <input type="tel" value={form.contractorPhone}
              onChange={(e) => setForm({ ...form, contractorPhone: e.target.value })}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">ショートメールでの連絡</label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setForm({ ...form, smsAllowed: true })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                  form.smsAllowed
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-800 text-gray-300 border-gray-600 hover:border-blue-400"
                }`}>可</button>
              <button type="button"
                onClick={() => setForm({ ...form, smsAllowed: false })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                  !form.smsAllowed
                    ? "bg-gray-600 text-white border-gray-600"
                    : "bg-gray-800 text-gray-300 border-gray-600 hover:border-gray-400"
                }`}>不可</button>
            </div>
          </div>

          {/* 入居者への連絡・訪問希望 */}
          <div className="border border-gray-700 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-200">入居者への連絡・訪問希望 <span className="text-gray-500 font-normal text-xs">（任意）</span></p>
            <div>
              <label className="block text-xs text-gray-400 mb-1">連絡希望日時</label>
              <input type="text" value={form.preferredContactAt}
                onChange={(e) => setForm({ ...form, preferredContactAt: e.target.value })}
                className={inputClass} placeholder="例: 5/10 午前中" maxLength={15} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">訪問希望日時</label>
              <input type="text" value={form.preferredVisitAt}
                onChange={(e) => setForm({ ...form, preferredVisitAt: e.target.value })}
                className={inputClass} placeholder="例: 5/12 14時以降" maxLength={15} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">入居開始日</label>
              <input type="text" value={form.moveInDate}
                onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
                className={inputClass} placeholder="例: R7.6.1" maxLength={12} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">依頼内容</label>
            <textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">金額【税別】</label>
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
                className="w-full border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">売上（積水請求・税別）<span className="text-gray-500 font-normal text-xs ml-1">協力会社には表示されません</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
              <input type="text" inputMode="numeric" value={form.salesAmount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
                  setForm({ ...form, salesAmount: v });
                }}
                className="w-full border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">材料費（税別）<span className="text-gray-500 font-normal text-xs ml-1">協力会社には表示されません</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
              <input type="text" inputMode="numeric" value={form.materialCost}
                onChange={(e) => {
                  const v = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
                  setForm({ ...form, materialCost: v });
                }}
                className="w-full border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">緊急度</label>
            <div className="flex gap-2">
              {[
                { value: "LOW", label: "低", active: "bg-green-600 text-white border-green-600", hover: "hover:border-green-400" },
                { value: "MEDIUM", label: "中", active: "bg-yellow-900/300 text-white border-yellow-500", hover: "hover:border-yellow-400" },
                { value: "HIGH", label: "高", active: "bg-red-600 text-white border-red-600", hover: "hover:border-red-400" },
              ].map(({ value, label, active, hover }) => (
                <button key={value} type="button"
                  onClick={() => setForm({ ...form, urgency: value })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    form.urgency === value ? active : `bg-gray-800 text-gray-300 border-gray-600 ${hover}`
                  }`}>{label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">材料支給</label>
            <button type="button"
              onClick={() => setForm({ ...form, materialSupplied: !form.materialSupplied })}
              className={`w-full py-2 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${
                form.materialSupplied
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-gray-800 text-gray-300 border-gray-600 hover:border-teal-400"
              }`}>
              📦 {form.materialSupplied ? "材料支給あり" : "材料支給なし"}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">完了報告のタイプ</label>
            <button type="button"
              onClick={() => setForm({ ...form, simpleReport: !form.simpleReport })}
              className={`w-full py-2 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${
                form.simpleReport
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-gray-700 text-gray-300 border-gray-600 hover:border-emerald-500"
              }`}>
              {form.simpleReport ? "📝 簡易報告でOK（定型作業）" : "📋 詳細報告（状況・原因まで）"}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">駐車場空き区画</label>
            <input type="text" value={form.parkingInfo}
              onChange={(e) => setForm({ ...form, parkingInfo: e.target.value })}
              className={inputClass} placeholder="例: 12番・来客用" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">エリア</label>
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

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">担当協力会社 *</label>
            <select required value={form.assignedToId}
              onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
              className={inputClass}>
              <option value=""></option>
              {myId && <option value={myId}>🔧 自分で施工（{myName || "管理者"}）</option>}
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.companyName || p.name}</option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? "保存中..." : "変更を保存する"}
          </button>
        </form>
      </main>
    </div>
  );
}
