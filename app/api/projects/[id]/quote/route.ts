import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyQuoteSubmitted, notifyQuoteResult } from "@/lib/email";

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

  const quote = await prisma.quote.create({
    data: {
      projectId: id,
      submittedById: userId,
      amount: body.amount ? parseInt(body.amount) : null,
      notes: body.notes,
      filename: body.filename,
      status: "PENDING",
    },
  });

  const project = await prisma.project.update({
    where: { id },
    data: { status: "COMPLETED" },
  });

  // アクティビティログ
  await prisma.activityLog.create({
    data: {
      projectId: id, userId,
      action: "QUOTE_SUBMITTED",
      detail: body.amount ? `¥${parseInt(body.amount).toLocaleString()}` : "金額未記入",
    },
  });

  // 管理者へメール通知
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  await notifyQuoteSubmitted(admins.map(a => a.email), id, project.title, userName, quote.amount);

  return NextResponse.json(quote);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = (session.user as { id: string }).id;
  const { id } = await params;
  const body = await req.json();

  const quote = await prisma.quote.update({
    where: { id: body.quoteId },
    data: { status: body.status },
    include: { project: { include: { assignedTo: { select: { email: true } } } } },
  });

  let newProjectStatus = "";
  if (body.status === "APPROVED") {
    newProjectStatus = "COMPLETED";
    await prisma.project.update({ where: { id }, data: { status: "COMPLETED" } });
  } else if (body.status === "REJECTED") {
    newProjectStatus = "REJECTED";
    await prisma.project.update({ where: { id }, data: { status: "REJECTED" } });
  }

  // アクティビティログ
  await prisma.activityLog.create({
    data: {
      projectId: id, userId,
      action: "QUOTE_REVIEWED",
      detail: body.status === "APPROVED" ? "見積もりを承認" : "見積もりを却下",
    },
  });

  // 協力会社へメール通知
  if (newProjectStatus && quote.project.assignedTo?.email) {
    await notifyQuoteResult(
      quote.project.assignedTo.email, id, quote.project.title,
      body.status === "APPROVED"
    );
  }

  return NextResponse.json(quote);
}
