import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyNewComment } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role: string }).role;
  const body = await req.json();

  if (!body.content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  // 協力会社は自分の案件のみコメント可
  if (role === "PARTNER") {
    const proj = await prisma.project.findUnique({ where: { id }, select: { assignedToId: true } });
    if (proj?.assignedToId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [comment, project] = await Promise.all([
    prisma.comment.create({
      data: { projectId: id, authorId: userId, content: body.content.trim() },
      include: { author: { select: { name: true, companyName: true, role: true, avatarUrl: true } } },
    }),
    prisma.project.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { email: true } },
        createdBy: { select: { email: true } },
      },
    }),
  ]);

  // ログ記録
  await prisma.activityLog.create({
    data: { projectId: id, userId, action: "COMMENT", detail: body.content.trim().slice(0, 100) },
  });

  // 通知メール：相手側へ
  if (project) {
    const authorName = (session.user as { name?: string }).name || "ユーザー";
    if (role === "ADMIN") {
      // 管理者 → 協力会社へ
      if (project.assignedTo?.email) {
        await notifyNewComment([project.assignedTo.email], id, project.title, authorName, body.content);
      }
    } else {
      // 協力会社 → 管理者へ
      const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
      await notifyNewComment(admins.map(a => a.email), id, project.title, authorName, body.content);
    }
  }

  return NextResponse.json(comment);
}
