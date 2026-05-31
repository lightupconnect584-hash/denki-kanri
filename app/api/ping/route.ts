import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ ok: false });

  const userId = (session.user as { id: string }).id;

  // 最終アクセスから5分以上経過した場合のみ更新（DB負荷軽減）
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastLoginAt: true },
  });

  const now = new Date();
  const lastAccess = user?.lastLoginAt;
  const shouldUpdate = !lastAccess || now.getTime() - new Date(lastAccess).getTime() > 5 * 60 * 1000;

  if (shouldUpdate) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: now },
    });
  }

  return NextResponse.json({ ok: true });
}
