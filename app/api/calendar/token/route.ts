import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// カレンダー購読用トークンの取得（なければ発行）・再発行

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  let user = await prisma.user.findUnique({ where: { id: userId }, select: { calendarToken: true } });
  if (!user?.calendarToken) {
    const token = randomBytes(24).toString("hex");
    user = await prisma.user.update({ where: { id: userId }, data: { calendarToken: token }, select: { calendarToken: true } });
  }
  return NextResponse.json({ token: user.calendarToken });
}

// 再発行（古いURLは無効になる）
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const token = randomBytes(24).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: token } });
  return NextResponse.json({ token });
}
