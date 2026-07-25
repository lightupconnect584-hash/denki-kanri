import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 月別の売上・経費・利益の推移（管理者のみ）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [entries, expenses] = await Promise.all([
    prisma.salesEntry.findMany({ select: { yearMonth: true, sales: true, material: true, outsource: true } }),
    prisma.expenseItem.findMany({ select: { amount: true } }),
  ]);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const byMonth = new Map<string, { revenue: number; material: number; outsource: number }>();
  for (const e of entries) {
    if (!byMonth.has(e.yearMonth)) byMonth.set(e.yearMonth, { revenue: 0, material: 0, outsource: 0 });
    const m = byMonth.get(e.yearMonth)!;
    m.revenue += e.sales;
    m.material += e.material;
    m.outsource += e.outsource;
  }

  const months = Array.from(byMonth.keys()).sort().slice(-18); // 直近18ヶ月まで
  const trend = months.map((month) => {
    const m = byMonth.get(month)!;
    const cost = m.material + m.outsource + expenseTotal;
    const profit = m.revenue - cost;
    return {
      month,
      revenue: m.revenue,
      cost,
      profit,
      profitRate: m.revenue > 0 ? Math.round((profit / m.revenue) * 100) : null,
    };
  });

  return NextResponse.json({ trend });
}
