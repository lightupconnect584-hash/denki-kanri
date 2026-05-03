import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const body = await req.json();

  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json({ error: "パスワードを入力してください" }, { status: 400 });
  }
  if (body.newPassword.length < 6) {
    return NextResponse.json({ error: "新しいパスワードは6文字以上にしてください" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(body.currentPassword, user.password);
  if (!valid) return NextResponse.json({ error: "現在のパスワードが正しくありません" }, { status: 400 });

  const hashed = await bcrypt.hash(body.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

  return NextResponse.json({ success: true });
}
