import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role?: string })?.role;
  const { commentId, emoji } = await req.json();
  const { id: projectId } = await params;

  // コメントがこの案件のものか＋協力会社は自分の案件のみ（他案件への操作・探索を遮断）
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { projectId: true, project: { select: { assignedToId: true, subAssignees: { select: { userId: true } } } } },
  });
  if (!comment || comment.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (role === "PARTNER") {
    const ok = comment.project.assignedToId === userId || comment.project.subAssignees.some((u) => u.userId === userId);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.reaction.findUnique({
    where: { commentId_userId_emoji: { commentId, userId, emoji } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({ data: { commentId, userId, emoji } });
  }

  const reactions = await prisma.reaction.findMany({
    where: { commentId },
    select: { emoji: true, userId: true },
  });

  return NextResponse.json(reactions);
}
