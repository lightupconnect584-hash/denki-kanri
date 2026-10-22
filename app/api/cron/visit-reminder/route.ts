import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export const maxDuration = 60;

const ACTIVE_STATUSES = ["PENDING", "ACCEPTED", "REWORK"];

// 毎夕、明日の訪問予定がある担当者へ「確認SMSを送りませんか」を通知する
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  let adminOk = false;
  if (!cronOk) {
    const session = await getServerSession(authOptions);
    adminOk = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  }
  if (!cronOk && !adminOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 「明日」を日本時間で計算
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const dayStart = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() + 1) - 9 * 3600 * 1000);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const projects = await prisma.project.findMany({
    where: {
      visitDate: { gte: dayStart, lt: dayEnd },
      status: { in: ACTIVE_STATUSES },
      onHold: false,
      assignedToId: { not: null },
      contractorPhone: { not: null },
    },
    select: { id: true, title: true, visitTime: true, assignedToId: true },
  });

  let sent = 0;
  for (const p of projects) {
    if (!p.assignedToId) continue;
    try {
      await sendPushToUsers([p.assignedToId], {
        title: "📅 明日の訪問予定",
        body: `${p.title}${p.visitTime ? ` ${p.visitTime}` : ""} — 入居者へ確認SMSを送る場合は案件を開いてください`,
        url: `/projects/${p.id}`,
      });
      sent++;
    } catch { /* ignore */ }
  }
  return NextResponse.json({ projects: projects.length, sent });
}
