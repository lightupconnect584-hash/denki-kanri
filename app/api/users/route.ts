import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// 認証チェック共通処理
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: "Unauthorized", status: 401, session: null };
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return { error: "Forbidden", status: 403, session: null };
  return { error: null, status: 200, session };
}

// 一覧取得
export async function GET() {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, companyName: true, role: true, avatarUrl: true, color: true },
    orderBy: { role: "asc" },
  });
  return NextResponse.json(users);
}

// 新規作成
export async function POST(req: NextRequest) {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const body = await req.json();
  const hashedPassword = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      password: hashedPassword,
      role: body.role || "PARTNER",
      companyName: body.companyName || null,
    },
  });
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}

// パスワード変更: PATCH /api/users?id=xxx  body: { password }
export async function PATCH(req: NextRequest) {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });

  const body = await req.json();

  // カラー変更
  if (body.color !== undefined) {
    await prisma.user.update({ where: { id }, data: { color: body.color || null } });
    return NextResponse.json({ ok: true });
  }

  // パスワード変更
  const { password } = body;
  if (!password || password.length < 4)
    return NextResponse.json({ error: "パスワードは4文字以上必要です" }, { status: 400 });

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { password: hashed } });
  return NextResponse.json({ ok: true });
}

// 削除: DELETE /api/users?id=xxx
export async function DELETE(req: NextRequest) {
  const { error, status, session } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });

  const sessionUserId = (session!.user as { id: string }).id;

  if (id === sessionUserId)
    return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1)
      return NextResponse.json({ error: "管理者が1人しかいないため削除できません" }, { status: 400 });
    // 作成案件を操作者に引き継ぎ
    await prisma.project.updateMany({ where: { createdById: id }, data: { createdById: sessionUserId } });
  } else {
    const inspCount = await prisma.inspection.count({ where: { inspectorId: id } });
    const quoteCount = await prisma.quote.count({ where: { submittedById: id } });
    if (inspCount > 0 || quoteCount > 0)
      return NextResponse.json(
        { error: `点検報告${inspCount}件・見積${quoteCount}件の記録があり削除できません` },
        { status: 409 }
      );
  }

  await prisma.project.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
  await prisma.activityLog.deleteMany({ where: { userId: id } });
  await prisma.comment.deleteMany({ where: { authorId: id } });
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
