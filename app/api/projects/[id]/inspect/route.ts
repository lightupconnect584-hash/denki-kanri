import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyInspectionSubmitted } from "@/lib/email";
import { sendPushToUsers, getAdminIds } from "@/lib/push";

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
        create: (body.photos || []).map((p: { filename: string; originalName: string; category?: string }) => ({
          filename: p.filename,
          originalName: p.originalName,
          category: p.category || "before",
        })),
      },
    },
    include: { photos: true },
  });

  // 「修理が必要」→見積り依頼中 は協力会社のフロー。自社案件（報告者=管理者）は見積り不要なのでINSPECTEDのまま
  const newStatus = body.result === "REPAIR_NEEDED" && role === "PARTNER" ? "QUOTE_REQUESTED" : "INSPECTED";
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

  // 管理者へメール通知（報告者本人は除外：自社案件で自分に通知が飛ばないように）
  const actorEmail = (session.user as { email?: string }).email;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  const notifyEmails = admins.map(a => a.email).filter(e => e !== actorEmail);
  const workDateStr = new Date(body.workDate).toLocaleDateString("ja-JP");
  if (notifyEmails.length > 0) {
    await notifyInspectionSubmitted(
      notifyEmails, id, project.title,
      userName, body.result, workDateStr
    );
  }

  // 管理者へプッシュ通知（報告者本人は除外）
  const resultLabel = body.result === "REPAIR_NEEDED" ? "🔧 修理が必要" : "✅ 問題なし";
  getAdminIds().then((adminIds) => {
    const targets = adminIds.filter((a) => a !== userId);
    if (targets.length === 0) return;
    return sendPushToUsers(targets, {
      title: `完了報告が届きました`,
      body: `${project.title} — ${resultLabel}（${userName}）`,
      url: `/projects/${id}`,
    });
  }).catch(() => {});

  return NextResponse.json(inspection);
}

// PATCH: 既存の完了報告を編集（管理者は全件、協力会社は自分の報告のみ）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role: string }).role;
  const body = await req.json();
  const inspectionId = String(body.inspectionId || "");
  if (!inspectionId) return NextResponse.json({ error: "inspectionId required" }, { status: 400 });

  const inspection = await prisma.inspection.findFirst({ where: { id: inspectionId, projectId: id } });
  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // 協力会社は自分が提出した報告のみ編集可
  if (role !== "ADMIN" && inspection.inspectorId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (body.result !== undefined) data.result = String(body.result);
  if (body.notes !== undefined) data.notes = String(body.notes ?? "");
  if (Array.isArray(body.workDates)) {
    const dates = body.workDates.filter(Boolean).sort() as string[];
    if (dates.length > 0) {
      data.workDates = dates;
      data.workDate = new Date(dates[dates.length - 1]); // 最終日を完了日に
    }
  } else if (body.workDate) {
    data.workDate = new Date(body.workDate);
  }

  await prisma.inspection.update({ where: { id: inspectionId }, data });

  await prisma.activityLog.create({
    data: { projectId: id, userId, action: "INSPECTION_EDIT", detail: "完了報告を修正しました" },
  });

  return NextResponse.json({ ok: true });
}
