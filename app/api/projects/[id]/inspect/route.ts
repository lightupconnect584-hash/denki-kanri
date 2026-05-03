import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyInspectionSubmitted } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role: string }).role;
  const userName = (session.user as { name?: string }).name || "担当者";
  const body = await req.json();

  // 協力会社は自分の案件のみ操作可
  if (role === "PARTNER") {
    const project = await prisma.project.findUnique({ where: { id }, select: { assignedToId: true } });
    if (project?.assignedToId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const inspection = await prisma.inspection.create({
    data: {
      projectId: id,
      inspectorId: userId,
      result: body.result,
      workDate: new Date(body.workDate),
      workDates: (body.workDates || [body.workDate]).filter(Boolean),
      notes: body.notes,
      photos: {
        create: (body.photos || []).map((p: { filename: string; originalName: string }) => ({
          filename: p.filename,
          originalName: p.originalName,
        })),
      },
    },
    include: { photos: true },
  });

  const newStatus = body.result === "REPAIR_NEEDED" ? "QUOTE_REQUESTED" : "INSPECTED";
  const project = await prisma.project.update({
    where: { id },
    data: { status: newStatus, notifyAdminAt: new Date() },
  });

  // アクティビティログ
  await prisma.activityLog.create({
    data: {
      projectId: id, userId,
      action: "INSPECTION",
      detail: body.result === "REPAIR_NEEDED" ? "完了報告: 修理が必要" : "完了報告: 問題なし",
    },
  });

  // 管理者へメール通知
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  const workDateStr = new Date(body.workDate).toLocaleDateString("ja-JP");
  await notifyInspectionSubmitted(
    admins.map(a => a.email), id, project.title,
    userName, body.result, workDateStr
  );

  return NextResponse.json(inspection);
}
