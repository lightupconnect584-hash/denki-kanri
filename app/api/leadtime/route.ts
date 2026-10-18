import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

// 受付（受付ボックス受信 or 案件登録）→ 最初の完了報告 のリードタイムを担当者別に集計（管理者のみ）
// 「要アポ」（入居者と日程調整が必要）の案件は除外。直近90日。
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const since = new Date(Date.now() - 90 * 86400000);
  const projects = await prisma.project.findMany({
    where: {
      contactRequired: false,
      inspections: { some: {} },
      createdAt: { gte: since },
      assignedToId: { not: null },
    },
    select: {
      id: true,
      createdAt: true,
      assignedToId: true,
      inspections: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  const intakes = await prisma.intakeDoc.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const intakeMap = new Map<string, Date>();
  for (const i of intakes) {
    if (i.projectId && !intakeMap.has(i.projectId)) intakeMap.set(i.projectId, i.createdAt);
  }

  const byUser = new Map<string, number[]>();
  for (const p of projects) {
    const start = intakeMap.get(p.id) || p.createdAt;
    const end = p.inspections[0]?.createdAt;
    if (!end || !p.assignedToId) continue;
    const days = (end.getTime() - start.getTime()) / 86400000;
    if (days < 0 || days > 120) continue;
    if (!byUser.has(p.assignedToId)) byUser.set(p.assignedToId, []);
    byUser.get(p.assignedToId)!.push(days);
  }

  const result: Record<string, { n: number; avg: number; med: number }> = {};
  for (const [uid, arr] of byUser) {
    arr.sort((a, b) => a - b);
    result[uid] = {
      n: arr.length,
      avg: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10,
      med: Math.round(arr[Math.floor(arr.length / 2)] * 10) / 10,
    };
  }
  return NextResponse.json(result);
}
