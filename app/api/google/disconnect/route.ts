import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Google連携を解除（トークン破棄・イベント対応表を削除。カレンダー上の予定は残る）
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { googleRefreshToken: true } });
  if (user?.googleRefreshToken) {
    // Google側のアクセス許可も取り消す（ベストエフォート）
    await fetch(`https://oauth2.googleapis.com/revoke?token=${user.googleRefreshToken}`, { method: "POST" }).catch(() => {});
  }
  await prisma.googleEvent.deleteMany({ where: { userId } });
  await prisma.user.update({
    where: { id: userId },
    data: { googleRefreshToken: null, googleEmail: null },
  });
  return NextResponse.json({ ok: true });
}
