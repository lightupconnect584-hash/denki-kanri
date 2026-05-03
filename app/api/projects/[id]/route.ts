import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  const { id } = await params;

  // 協力会社は自分に割り当てられた案件のみ閲覧可
  const project = await prisma.project.findUnique({
    where: role === "PARTNER" ? { id, assignedToId: userId } : { id },
    include: {
      assignedTo: { select: { id: true, name: true, companyName: true, email: true } },
      createdBy: { select: { name: true, avatarUrl: true, phone: true } },
      projectPhotos: true,
      inspections: {
        include: {
          photos: true,
          inspector: { select: { name: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      quotes: {
        include: {
          submittedBy: { select: { name: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      comments: {
        include: { author: { select: { name: true, companyName: true, role: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
      activityLogs: {
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  await prisma.activityLog.deleteMany({ where: { projectId: id } });
  await prisma.comment.deleteMany({ where: { projectId: id } });
  await prisma.photo.deleteMany({ where: { inspection: { projectId: id } } });
  await prisma.inspection.deleteMany({ where: { projectId: id } });
  await prisma.quote.deleteMany({ where: { projectId: id } });
  await prisma.projectPhoto.deleteMany({ where: { projectId: id } });
  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const role = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) {
    updateData.status = body.status;
    // 協力会社が差し戻し → 管理者に通知
    if (body.status === "REJECTED") updateData.notifyAdminAt = new Date();
    // 管理者が再報告要求 → 協力会社に通知
    if (body.status === "REWORK") updateData.notifyPartnerAt = new Date();
  }
  // 担当変更（再アサイン）→ 協力会社に通知
  if (body.assignedToId !== undefined) {
    updateData.assignedToId = body.assignedToId !== "" ? body.assignedToId : null;
    if (role === "ADMIN" && body.assignedToId) updateData.notifyPartnerAt = new Date();
  }

  // 訪問予定日は担当協力会社のみ変更可
  if (body.visitDate !== undefined) {
    const project = await prisma.project.findUnique({ where: { id }, select: { assignedToId: true, status: true } });
    if (role === "PARTNER" && project?.assignedToId === userId && ["PENDING", "ACCEPTED", "REWORK"].includes(project?.status ?? "")) {
      updateData.visitDate = body.visitDate ? new Date(body.visitDate) : null;
    }
    // 管理者は visitDate を変更不可（無視）
  }
  // 編集フィールド（管理者が内容を変更した場合 → 協力会社に通知）
  const contentFields = ["title", "location", "contractorName", "contractorPhone", "smsAllowed", "description", "urgency", "dueDate"];
  const contentEdited = role === "ADMIN" && contentFields.some(f => body[f] !== undefined);
  if (contentEdited) updateData.notifyPartnerAt = new Date();
  if (body.title !== undefined) updateData.title = body.title;
  if (body.location !== undefined) updateData.location = body.location;
  if (body.contractorName !== undefined) updateData.contractorName = body.contractorName || null;
  if (body.contractorPhone !== undefined) updateData.contractorPhone = body.contractorPhone || null;
  if (body.smsAllowed !== undefined) updateData.smsAllowed = body.smsAllowed;
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.urgency !== undefined) updateData.urgency = body.urgency;
  if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  // 金額変更は管理者のみ・変更履歴を記録
  let oldAmount: number | null = null;
  if (body.amount !== undefined && role === "ADMIN") {
    const current = await prisma.project.findUnique({ where: { id }, select: { amount: true } });
    oldAmount = current?.amount ?? null;
    const newAmount = body.amount ? parseInt(body.amount) : null;
    updateData.amount = newAmount;
  }

  // 協力会社は自分の案件のみ操作可
  const whereClause = role === "PARTNER" ? { id, assignedToId: userId } : { id };
  const project = await prisma.project.update({
    where: whereClause,
    data: updateData,
  });

  // 金額変更ログ
  if (body.amount !== undefined && role === "ADMIN") {
    const newAmount = body.amount ? parseInt(body.amount) : null;
    const oldStr = oldAmount != null ? `¥${oldAmount.toLocaleString()}` : "未設定";
    const newStr = newAmount != null ? `¥${newAmount.toLocaleString()}` : "未設定";
    if (oldAmount !== newAmount) {
      await prisma.activityLog.create({
        data: {
          projectId: id,
          userId,
          action: "AMOUNT_CHANGED",
          detail: `${oldStr} → ${newStr}`,
        },
      });
    }
  }

  return NextResponse.json(project);
}
