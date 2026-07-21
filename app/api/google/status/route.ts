import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { googleConfigured } from "@/lib/googleCalendar";

// 連携状態を返す
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleEmail: true, googleRefreshToken: true },
  });
  return NextResponse.json({
    configured: googleConfigured(),
    connected: !!user?.googleRefreshToken,
    email: user?.googleEmail || null,
  });
}
