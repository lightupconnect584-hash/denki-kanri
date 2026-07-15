import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { actionReason } from "@/lib/actionRequired";

// 要対応件数を返す（BottomNavのバッジ用）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  const projects = await prisma.project.findMany({
    where: {
      status: { notIn: ["CONFIRMED", "COMPLETED"] },
      ...(role === "PARTNER" ? { assignedToId: userId } : {}),
    },
    select: {
      status: true,
      visitDate: true,
      onHold: true,
      holdAt: true,
      updatedAt: true,
      assignedToId: true,
      quotes: { select: { status: true } },
    },
  });

  const count = projects.filter((p) => actionReason(role, p) !== null).length;
  return NextResponse.json({ count });
}
