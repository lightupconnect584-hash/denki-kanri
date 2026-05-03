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
  const userName = (session.user as { name?: string }).name || "担当者";
  const body = await req.json();

  const inspection = await prisma.inspection.create({
    data: {
      projectId: id,
      inspectorId: userId,
      result: body.result,
      workDate: new Date(body.workDate),
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
    data: { status: newStatus },
  });

  // アクティビティログ
  await prisma.activityLog.create({
    data: {
      projectId: id, userId,
      action: "INSPECTION",
      detail: body.result === "REPAIR_NEEDED" ? "点検結果: 修理が必要" : "点検結果: 問題なし",
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
