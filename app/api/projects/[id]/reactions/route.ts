import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { commentId, emoji } = await req.json();
  await params;

  const existing = await prisma.reaction.findUnique({
    where: { commentId_userId_emoji: { commentId, userId, emoji } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({ data: { commentId, userId, emoji } });
  }

  const reactions = await prisma.reaction.findMany({
    where: { commentId },
    select: { emoji: true, userId: true },
  });

  return NextResponse.json(reactions);
}
