import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// パスワードリセット (ADMIN only)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { password } = await req.json();
  if (!password || password.length < 4)
    return NextResponse.json({ error: "パスワードは4文字以上必要です" }, { status: 400 });

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: params.id }, data: { password: hashed } });
  return NextResponse.json({ ok: true });
}

// アカウント削除 (ADMIN only)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sessionUserId = (session.user as { id: string }).id;

  // 自分自身は削除不可
  if (params.id === sessionUserId) {
    return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });

  // 管理者を削除する場合、最後の1人なら不可
  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "管理者が1人しかいないため削除できません" }, { status: 400 });
    }
  }

  // 点検・見積データが残っているか確認（協力会社のみ）
  if (target.role === "PARTNER") {
    const inspCount = await prisma.inspection.count({ where: { inspectorId: params.id } });
    const quoteCount = await prisma.quote.count({ where: { submittedById: params.id } });
    if (inspCount > 0 || quoteCount > 0) {
      return NextResponse.json(
        { error: `この協力会社には点検報告${inspCount}件・見積${quoteCount}件の記録があります。削除できません。` },
        { status: 409 }
      );
    }
  }

  try {
    // 管理者の場合: 作成案件を操作者に引き継ぎ
    if (target.role === "ADMIN") {
      await prisma.project.updateMany({
        where: { createdById: params.id },
        data: { createdById: sessionUserId },
      });
    }

    // 担当案件の割り当てを解除
    await prisma.project.updateMany({ where: { assignedToId: params.id }, data: { assignedToId: null } });
    await prisma.activityLog.deleteMany({ where: { userId: params.id } });
    await prisma.comment.deleteMany({ where: { authorId: params.id } });
    await prisma.user.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("DELETE /api/users/[id] error:", message);
    return NextResponse.json({ error: `削除エラー: ${message}` }, { status: 500 });
  }
}
