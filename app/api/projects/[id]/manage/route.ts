import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 案件の管理ページ用データ（管理者のみ・協力会社は絶対アクセス不可）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // 協力会社は404（存在ごと隠す）
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true, title: true,
      sekisuiNumber: true, managerName: true, afterManagerName: true,
      salesAmount: true, materialCost: true, memo: true,
      client: { select: { name: true } },
      projectPhotos: { select: { id: true, filename: true, originalName: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 依頼書原本（受付ボックス経由で紐づいたもの）
  const intake = await prisma.intakeDoc.findFirst({
    where: { projectId: id },
    select: { id: true, originalName: true },
  });

  // 添付された依頼書原本（自社案件で自動添付されたもの）
  const attachedOriginals = project.projectPhotos.filter((ph) => ph.originalName.includes("依頼書原本"));

  return NextResponse.json({
    id: project.id,
    title: project.title,
    clientName: project.client?.name || null,
    sekisuiNumber: project.sekisuiNumber,
    managerName: project.managerName,
    afterManagerName: project.afterManagerName,
    salesAmount: project.salesAmount,
    materialCost: project.materialCost,
    memo: project.memo,
    intake, // { id, originalName } | null
    attachedOriginals, // [{ id, filename, originalName }]
  });
}
