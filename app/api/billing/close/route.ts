import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncSalesEntryForProject } from "@/lib/salesSync";

const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];

// POST: 未締めの完了済案件を指定月で締める（管理者のみ）
//   body: { month: "YYYY-MM", projectIds?: string[], partnerId?: string } または { byWorkMonth: true }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  // 作業月で一括締め：未締めの各案件を、その作業月（最新の完了報告日、なければ期日/作成日）で締める
  if (body.byWorkMonth) {
    const targets = await prisma.project.findMany({
      where: { status: { in: DONE_STATUSES }, billingMonth: null },
      select: {
        id: true,
        title: true,
        location: true,
        amount: true,
        assignedToId: true,
        salesAmount: true,
        materialCost: true,
        dueDate: true,
        createdAt: true,
        inspections: { select: { workDate: true } },
      },
    });
    let closed = 0;
    for (const p of targets) {
      let d: Date;
      if (p.inspections.length > 0) {
        d = p.inspections.reduce((a, b) => (a > b.workDate ? a : b.workDate), p.inspections[0].workDate);
      } else {
        d = p.dueDate ?? p.createdAt;
      }
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      await prisma.project.update({ where: { id: p.id }, data: { billingMonth: ym } });
      // 売上集計の行も締めた月に合わせる（なければ作成）
      await syncSalesEntryForProject(p, ym);
      closed++;
    }
    return NextResponse.json({ closed, byWorkMonth: true });
  }

  const month = String(body.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }

  // projectIds が指定されればその案件のみ、なければ未締め全件を締める
  const projectIds: string[] | undefined = Array.isArray(body.projectIds) ? body.projectIds : undefined;

  const targets = await prisma.project.findMany({
    where: {
      status: { in: DONE_STATUSES },
      billingMonth: null,
      ...(projectIds ? { id: { in: projectIds } } : {}),
      ...(body.partnerId ? { assignedToId: body.partnerId } : {}),
    },
    select: { id: true, title: true, location: true, amount: true, assignedToId: true, salesAmount: true, materialCost: true },
  });

  for (const p of targets) {
    await prisma.project.update({ where: { id: p.id }, data: { billingMonth: month } });
    // 売上集計の行も締めた月に移動（なければ作成）。入力済みの売上・材料費は保持
    await syncSalesEntryForProject(p, month);
  }

  return NextResponse.json({ closed: targets.length, month });
}

// DELETE: 指定月の締めを解除して未締めに戻す（管理者のみ）
//   body: { month: "YYYY-MM", partnerId?: string }
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const month = String(body.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }

  const result = await prisma.project.updateMany({
    where: {
      status: { in: DONE_STATUSES },
      billingMonth: month,
      ...(body.partnerId ? { assignedToId: body.partnerId } : {}),
    },
    data: { billingMonth: null },
  });

  return NextResponse.json({ reopened: result.count, month });
}
