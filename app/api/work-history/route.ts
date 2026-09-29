import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 作業名で過去案件の金額実績を検索（管理者のみ）
// 単価の参考用: 依頼名(workType)の部分一致で、売上・協力会社支払の実績を新しい順に返す
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 5, 30);
  if (q.length < 2) return NextResponse.json({ items: [], stats: null });

  const projects = await prisma.project.findMany({
    where: {
      workType: { contains: q, mode: "insensitive" },
      OR: [{ salesAmount: { not: null } }, { amount: { not: null } }],
    },
    select: {
      id: true, title: true, workType: true, salesAmount: true, amount: true,
      createdAt: true,
      assignedTo: { select: { companyName: true, name: true } },
      inspections: { select: { workDate: true }, orderBy: { workDate: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const items = projects.map((p) => ({
    id: p.id,
    title: p.title,
    workType: p.workType,
    salesAmount: p.salesAmount,
    amount: p.amount,
    partner: p.assignedTo?.companyName || p.assignedTo?.name || null,
    date: (p.inspections[0]?.workDate || p.createdAt).toISOString().slice(0, 10),
  }));

  const salesVals = items.map((i) => i.salesAmount).filter((v): v is number => v != null && v > 0);
  const payVals = items.map((i) => i.amount).filter((v): v is number => v != null && v > 0);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null);
  const mode = (a: number[]) => {
    if (a.length === 0) return null;
    const m = new Map<number, number>();
    for (const v of a) m.set(v, (m.get(v) || 0) + 1);
    return Array.from(m.entries()).sort((x, y) => y[1] - x[1])[0][0];
  };
  const stats = {
    count: items.length,
    salesAvg: avg(salesVals),
    salesMode: mode(salesVals),
    payAvg: avg(payVals),
  };

  return NextResponse.json({ items: items.slice(0, limit), stats });
}
