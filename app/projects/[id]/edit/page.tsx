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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/users").then((r) => r.json()).then((data) => setPartners(data.filter((u: Partner) => u.role === "PARTNER")));
      fetch(`/api/projects/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setForm({
            title: data.title || "",
            location: data.location || "",
            contractorName: data.contractorName || "",
            contractorPhone: data.contractorPhone || "",
            smsAllowed: data.smsAllowed ?? false,
            description: data.description || "",
            urgency: data.urgency || "LOW",
            amount: data.amount != null ? String(data.amount) : "",
            dueDate: data.dueDate ? data.dueDate.slice(0, 10) : "",
            assignedToId: data.assignedTo?.id || "",
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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
          <h2 className="text-lg font-bold text-gray-800">案件を編集</h2>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">物件名 *</label>
            <input type="text" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">住所 *</label>
            <input type="text" required value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">契約者名</label>
            <input type="text" value={form.contractorName}
              onChange={(e) => setForm({ ...form, contractorName: e.target.value })}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">契約者連絡先</label>
            <input type="tel" value={form.contractorPhone}
              onChange={(e) => setForm({ ...form, contractorPhone: e.target.value })}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ショートメールでの連絡</label>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">依頼内容</label>
            <textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} className={inputClass} />
          </div>

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
                  }`}>{label}</button>
              ))}
            </div>
          </div>

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

          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? "保存中..." : "変更を保存する"}
          </button>
        </form>
      </main>
    </div>
  );
}
