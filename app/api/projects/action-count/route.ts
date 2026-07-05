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
      // 管理者は完了済でも未処理タスクが残っている可能性があるため全件対象
      ...(role === "PARTNER"
        ? { status: { notIn: ["CONFIRMED", "COMPLETED"] }, assignedToId: userId }
        : {}),
    },
    select: {
      status: true,
      visitDate: true,
      updatedAt: true,
      assignedToId: true,
      quotes: { select: { status: true } },
      ...(role === "ADMIN" ? { adminTasks: { select: { done: true } } } : {}),
    },
  });

  const count = projects.filter((p) => actionReason(role, p) !== null).length;
  return NextResponse.json({ count });
}
