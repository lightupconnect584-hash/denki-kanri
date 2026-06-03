import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 現在ユーザーの push 購読件数を返す（デバッグ用）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, createdAt: true, endpoint: true },
  });

  return NextResponse.json({
    userId,
    count: subs.length,
    subs: subs.map(s => ({
      id: s.id,
      createdAt: s.createdAt,
      endpointTail: s.endpoint.slice(-40),
    })),
  });
}
