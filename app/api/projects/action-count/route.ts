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
      contactRequired: true,
      contactTag: true,
      contactedAt: true,
      onHold: true,
      holdAt: true,
      updatedAt: true,
      assignedToId: true,
      quotes: { select: { status: true } },
    },
  });

  let count = projects.filter((p) => actionReason(role, p) !== null).length;
  // ✅ 完了後連絡が未了の完了案件も要対応に数える（管理者のみ）
  if (role !== "PARTNER") {
    count += await prisma.project.count({
      where: { status: { in: ["CONFIRMED", "COMPLETED"] }, afterContactRequired: true, afterContactedAt: null },
    });
  }
  return NextResponse.json({ count });
}
