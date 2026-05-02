"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

interface Project {
  id: string;
  title: string;
  location: string;
  status: string;
  dueDate: string | null;
  assignedTo: { name: string; companyName: string | null } | null;
  inspections: { id: string }[];
  quotes: { id: string; status: string }[];
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((data) => {
          setProjects(data);
          setLoading(false);
        });
    }
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const statusOrder = ["PENDING", "INSPECTING", "QUOTE_REQUESTED", "QUOTE_RECEIVED", "INSPECTED", "COMPLETED"];
  const sorted = [...projects].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-800">案件一覧</h2>
          {role === "ADMIN" && (
            <Link
              href="/projects/new"
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              ＋ 新規案件
            </Link>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>案件がありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{p.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">📍 {p.location}</p>
                    {p.assignedTo && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        担当: {p.assignedTo.companyName || p.assignedTo.name}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={p.status} />
                    {p.dueDate && (
                      <p className="text-xs text-gray-400">
                        期日: {new Date(p.dueDate).toLocaleDateString("ja-JP")}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
