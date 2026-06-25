import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put, del } from "@vercel/blob";

export const maxDuration = 60;

// GET: この案件の請求書一覧
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  const userId = (session.user as { id: string }).id;

  // 協力会社は自分の案件のみ
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { assignedToId: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "PARTNER" && project.assignedToId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { projectId: params.id },
    include: { uploadedBy: { select: { name: true, companyName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(invoices);
}

// POST: 請求書をアップロード（担当協力会社のみ）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  const userId = (session.user as { id: string }).id;

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { assignedToId: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // 担当の協力会社のみアップロード可
  if (role !== "PARTNER" || project.assignedToId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const blob = await put(file.name, file, {
    access: "public",
    addRandomSuffix: true,
  });

  const invoice = await prisma.invoice.create({
    data: {
      filename: blob.url,
      originalName: file.name,
      projectId: params.id,
      uploadedById: userId,
    },
  });

  // 管理者に通知
  await prisma.project.update({
    where: { id: params.id },
    data: { notifyAdminAt: new Date() },
  });

  return NextResponse.json(invoice);
}

// DELETE: 請求書を削除（アップロードした協力会社、または管理者）
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  const userId = (session.user as { id: string }).id;

  const { invoiceId } = await req.json();
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, projectId: params.id },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 管理者、または自分がアップロードした請求書のみ削除可
  if (role !== "ADMIN" && invoice.uploadedById !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (invoice.filename.startsWith("http")) await del(invoice.filename);
  } catch {
    // Blob削除失敗しても続行
  }

  await prisma.invoice.delete({ where: { id: invoiceId } });
  return NextResponse.json({ ok: true });
}
