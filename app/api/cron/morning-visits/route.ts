import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export const maxDuration = 60;

const ACTIVE_STATUSES = ["PENDING", "ACCEPTED", "REWORK", "INSPECTED", "QUOTE_REQUESTED", "QUOTE_REVIEWING"];

// 毎朝、今日の訪問予定を担当者ごとにプッシュ通知する
export async function GET(req: NextRequest) {
  // Vercel Cron は CRON_SECRET を付与。管理者は手動実行も可。
  const auth = req.headers.get("authorization");
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  let adminOk = false;
  if (!cronOk) {
    const session = await getServerSession(authOptions);
    adminOk = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  }
  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 「今日」を日本時間で計算（サーバーはUTC）
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const dayStart = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()) - 9 * 3600 * 1000);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const projects = await prisma.project.findMany({
    where: {
      visitDate: { gte: dayStart, lt: dayEnd },
      status: { in: ACTIVE_STATUSES },
      onHold: false,
      assignedToId: { not: null },
    },
    select: { title: true, roomNumber: true, visitTime: true, assignedToId: true },
  });

  // 担当者ごとにまとめて1通に
  const byUser = new Map<string, typeof projects>();
  for (const p of projects) {
    const uid = p.assignedToId!;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(p);
  }

  let sent = 0;
  for (const [userId, list] of byUser) {
    list.sort((a, b) => (a.visitTime || "99:99").localeCompare(b.visitTime || "99:99"));
    const lines = list.slice(0, 4).map((p) => `${p.visitTime ? p.visitTime.split("〜")[0] : "時間未定"} ${p.title}${p.roomNumber ? ` ${p.roomNumber}` : ""}`);
    if (list.length > 4) lines.push(`ほか${list.length - 4}件`);
    await sendPushToUsers([userId], {
      title: `📅 今日の予定 ${list.length}件`,
      body: lines.join("\n"),
      url: "/dashboard",
    }).catch(() => {});
    sent++;
  }

  return NextResponse.json({ ok: true, users: sent, projects: projects.length });
}
