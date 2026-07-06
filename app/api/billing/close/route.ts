import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];

// POST: 未締めの完了済案件を指定月で締める（管理者のみ）
//   body: { month: "YYYY-MM", partnerId?: string }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const month = String(body.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }

  // projectIds が指定されればその案件のみ、なければ未締め全件を締める
  const projectIds: string[] | undefined = Array.isArray(body.projectIds) ? body.projectIds : undefined;

  const result = await prisma.project.updateMany({
    where: {
      status: { in: DONE_STATUSES },
      billingMonth: null,
      ...(projectIds ? { id: { in: projectIds } } : {}),
      ...(body.partnerId ? { assignedToId: body.partnerId } : {}),
    },
    data: { billingMonth: month },
  });

  return NextResponse.json({ closed: result.count, month });
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
