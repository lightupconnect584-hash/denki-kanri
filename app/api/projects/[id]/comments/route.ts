import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyNewComment } from "@/lib/email";
import { sendPushToUsers, getAdminIds } from "@/lib/push";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const userId = (session.user as { id?: string }).id;
    const role = (session.user as { role?: string }).role;

    // セッションにユーザーIDが含まれていない場合は再ログインを促す
    if (!userId) return NextResponse.json({ error: "セッションが無効です。一度ログアウトして再ログインしてください。" }, { status: 401 });

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
      prisma.project.update({
        where: { id },
        data: {
          updatedAt: new Date(),
          // 管理者コメント → 協力会社に通知、協力会社コメント → 管理者に通知
          ...(role === "ADMIN" ? { notifyPartnerAt: new Date() } : { notifyAdminAt: new Date() }),
        },
        include: {
          assignedTo: { select: { id: true, email: true } },
          createdBy: { select: { email: true } },
        },
      }),
    ]);

    // ログ記録
    await prisma.activityLog.create({
      data: { projectId: id, userId, action: "COMMENT", detail: body.content.trim().slice(0, 100) },
    }).catch(() => {}); // ログ失敗はコメント送信を止めない

    // 通知メール：相手側へ
    const authorName = (session.user as { name?: string }).name || "ユーザー";
    if (role === "ADMIN") {
      if (project.assignedTo?.email) {
        notifyNewComment([project.assignedTo.email], id, project.title, authorName, body.content).catch(() => {});
      }
    } else {
      prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } })
        .then((admins) => notifyNewComment(admins.map(a => a.email), id, project.title, authorName, body.content))
        .catch(() => {});
    }

    // プッシュ通知：相手側へ
    const notifBody = `${authorName}：${body.content.trim().slice(0, 60)}`;
    const notifUrl = `/projects/${id}`;
    if (role === "ADMIN" && project.assignedTo) {
      sendPushToUsers([project.assignedTo.id ?? ""], {
        title: `💬 ${project.title}`,
        body: notifBody,
        url: notifUrl,
      }).catch(() => {});
    } else if (role === "PARTNER") {
      getAdminIds().then((adminIds) =>
        sendPushToUsers(adminIds, {
          title: `💬 ${project.title}`,
          body: notifBody,
          url: notifUrl,
        })
      ).catch(() => {});
    }

    return NextResponse.json(comment);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[comments POST]", msg);
    // セッションのユーザーIDがDBに存在しない場合（再ログインで解決）
    if (msg.includes("Foreign key constraint") && msg.includes("authorId")) {
      return NextResponse.json({ error: "セッションが古くなっています。一度ログアウトして再ログインしてください。" }, { status: 401 });
    }
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

// 既読：自分宛て（相手が送った）コメントをまとめて既読にする
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id: string }).id;

  // 自分以外が送った、まだ未読のコメントを既読にする
  await prisma.comment.updateMany({
    where: { projectId: id, authorId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { searchParams } = req.nextUrl;
  const commentId = searchParams.get("commentId");
  if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true } });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (comment.authorId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}
