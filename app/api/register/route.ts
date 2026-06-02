import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// POST /api/register  body: { token, loginId, password }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, loginId, password, name, companyName } = body;

  if (!token || !loginId?.trim() || !password || password.length < 4) {
    return NextResponse.json({ error: "入力内容を確認してください" }, { status: 400 });
  }

  // トークン検証
  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user) {
    return NextResponse.json({ error: "招待リンクが無効または期限切れです" }, { status: 404 });
  }

  // ログインIDの重複チェック（自分以外）
  const existing = await prisma.user.findFirst({
    where: { email: loginId.trim(), NOT: { id: user.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "そのログインIDはすでに使われています" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      email: loginId.trim(),
      password: hashed,
      inviteToken: null,
      ...(name ? { name } : {}),
      ...(companyName ? { companyName } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

// GET /api/register?token=xxx → トークン有効確認
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { inviteToken: token },
    select: { id: true, companyName: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "invalid" }, { status: 404 });

  return NextResponse.json({ companyName: user.companyName, name: user.name === "招待中" ? null : user.name });
}
