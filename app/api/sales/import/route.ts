import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncSalesEntryForProject } from "@/lib/salesSync";

const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];

// POST: 売上集計に未登録の完了案件を取り込む（過去分のバックフィル用）
//   締め済みの案件はその締め月へ、未締めの案件は指定月へ入れる
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const month = String(body.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }

  const imported = await prisma.salesEntry.findMany({
    where: { projectId: { not: null } },
    select: { projectId: true },
  });
  const importedIds = new Set(imported.map((e) => e.projectId));

  const projects = await prisma.project.findMany({
    where: { status: { in: DONE_STATUSES } },
    select: { id: true, title: true, location: true, amount: true, billingMonth: true, assignedToId: true },
    orderBy: { createdAt: "asc" },
  });
  const targets = projects.filter((p) => !importedIds.has(p.id));

  for (const p of targets) {
    await syncSalesEntryForProject(p, p.billingMonth || month);
  }

  return NextResponse.json({ imported: targets.length });
}
