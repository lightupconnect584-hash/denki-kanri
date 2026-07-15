import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role: string }).role;

  const projects = await prisma.project.findMany({
    where: role === "ADMIN" ? {} : { assignedToId: userId, status: { not: "REJECTED" } },
    include: {
      assignedTo: { select: { id: true, name: true, companyName: true, color: true } },
      createdBy: { select: { name: true, avatarUrl: true, thankYouEnabled: true, thankYouImageUrl: true, thankYouMessage: true } },
      inspections: { include: { photos: true } },
      quotes: true,
      comments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // 協力会社には売上（積水請求額）・材料費を見せない
  if (role === "PARTNER") {
    const sanitized = projects.map((p) => {
      const { salesAmount: _s, materialCost: _m, managerName: _mn, afterManagerName: _an, ...rest } = p as typeof p & { salesAmount: number | null; materialCost: number | null; managerName: string | null; afterManagerName: string | null };
      void _s; void _m; void _mn; void _an;
      return rest;
    });
    return NextResponse.json(sanitized);
  }
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = (session.user as { id: string }).id;
  const body = await req.json();

  const project = await prisma.project.create({
    data: {
      title: body.title,
      location: body.location,
      roomNumber: body.roomNumber || null,
      workType: body.workType || null,
      contractorName: body.contractorName || null,
      contractorPhone: body.contractorPhone || null,
      smsAllowed: body.smsAllowed ?? false,
      description: body.description,
      urgency: body.urgency || "LOW",
      materialSupplied: body.materialSupplied ?? false,
      simpleReport: body.simpleReport ?? false,
      amount: body.amount !== undefined && body.amount !== "" && body.amount !== null ? parseInt(body.amount) : null,
      salesAmount: body.salesAmount !== undefined && body.salesAmount !== "" && body.salesAmount !== null ? parseInt(body.salesAmount) : null,
      materialCost: body.materialCost !== undefined && body.materialCost !== "" && body.materialCost !== null ? parseInt(body.materialCost) : null,
      managerName: body.managerName || null,
      afterManagerName: body.afterManagerName || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      assignedToId: body.assignedToId || null,
      preferredContactAt: body.preferredContactAt || null,
      preferredVisitAt: body.preferredVisitAt || null,
      moveInDate: body.moveInDate || null,
      receivedAt: body.receivedAt || null,
      parkingInfo: body.parkingInfo || null,
      region: body.region || null,
      createdById: userId,
      // 自社案件（担当＝作成者）は受注済みで作成
      status: body.assignedToId && body.assignedToId === userId && body.status === "ACCEPTED" ? "ACCEPTED" : "PENDING",
      notifyPartnerAt: new Date(),
      projectPhotos: {
        create: (body.photos || []).map((p: { filename: string; originalName: string }) => ({
          filename: p.filename,
          originalName: p.originalName,
        })),
      },
    },
  });

  // 担当者への通知（自社案件は自分宛なので不要）
  if (body.assignedToId && body.assignedToId !== userId) {
    sendPushToUsers([body.assignedToId], {
      title: "新しい依頼が届きました",
      body: `${body.title}（${body.location}）`,
      url: `/projects/${project.id}`,
    }).catch(() => {});
  }

  return NextResponse.json(project);
}
