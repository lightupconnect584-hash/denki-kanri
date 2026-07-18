import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 訪問予定のiCal（ICS）フィード
// カレンダーアプリ（iPhone標準・Googleカレンダー等）から照会カレンダーとして購読する。
// 認証はセッションではなく秘密トークン（カレンダーアプリはログインできないため）。

export const dynamic = "force-dynamic";

// ICSのテキストエスケープ
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// "9:30〜11:00" / "9時〜11時" / "9:00〜" から開始・終了[時,分]を取り出す
function parseVisitTime(t: string | null): { from: [number, number] | null; to: [number, number] | null } {
  if (!t) return { from: null, to: null };
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(?:時)?〜(?:(\d{1,2})(?::(\d{2}))?(?:時)?)?/);
  if (!m) return { from: null, to: null };
  const from: [number, number] = [parseInt(m[1]), m[2] ? parseInt(m[2]) : 0];
  const to: [number, number] | null = m[3] ? [parseInt(m[3]), m[4] ? parseInt(m[4]) : 0] : null;
  return { from, to };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (token.length < 20) return new NextResponse("Not found", { status: 404 });

  const user = await prisma.user.findUnique({
    where: { calendarToken: token },
    select: { id: true, role: true },
  });
  if (!user) return new NextResponse("Not found", { status: 404 });

  // 会社別フィード（管理者のみ）: ?partner=<userId> でその担当分だけに絞る
  const partnerId = req.nextUrl.searchParams.get("partner") || null;
  let calName = "電気工事 訪問予定";
  if (partnerId && user.role === "ADMIN") {
    const partner = await prisma.user.findUnique({
      where: { id: partnerId },
      select: { companyName: true, name: true },
    });
    if (!partner) return new NextResponse("Not found", { status: 404 });
    calName = `訪問予定｜${partner.companyName || partner.name}`;
  }

  // 直近60日〜未来の訪問予定（管理者=全件 / 協力会社=担当分のみ）
  const since = new Date(Date.now() - 60 * 86400000);
  const projects = await prisma.project.findMany({
    where: {
      visitDate: { not: null, gte: since },
      status: { not: "REJECTED" },
      ...(user.role === "PARTNER"
        ? { assignedToId: user.id }
        : partnerId
        ? { assignedToId: partnerId }
        : {}),
    },
    select: {
      id: true, title: true, location: true, roomNumber: true, workType: true,
      visitDate: true, visitTime: true, updatedAt: true,
      assignedTo: { select: { companyName: true, name: true } },
    },
    orderBy: { visitDate: "asc" },
  });

  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const baseUrl = process.env.NEXTAUTH_URL || "https://denki-kanri.vercel.app";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//denki-kanri//visit-calendar//JP",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    // 更新間隔のヒント（Apple系は概ね尊重・Googleへの希望提示）
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];

  for (const p of projects) {
    const d = new Date(p.visitDate!);
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    const { from, to } = parseVisitTime(p.visitTime);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:proj-${p.id}@denki-kanri`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (from) {
      // 時刻あり：ローカル時刻（端末のタイムゾーン＝日本で解釈される）
      const end: [number, number] = to ?? [from[0] + 1, from[1]]; // 終了未指定は+1時間
      lines.push(`DTSTART:${y}${pad(mo)}${pad(day)}T${pad(from[0])}${pad(from[1])}00`);
      lines.push(`DTEND:${y}${pad(mo)}${pad(day)}T${pad(Math.min(end[0], 23))}${pad(end[1])}00`);
    } else {
      // 時間未定：終日イベント
      const next = new Date(y, mo - 1, day + 1);
      lines.push(`DTSTART;VALUE=DATE:${y}${pad(mo)}${pad(day)}`);
      lines.push(`DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`);
    }
    const summary = `🔌 ${p.title}${p.roomNumber ? ` ${p.roomNumber}` : ""}`;
    lines.push(`SUMMARY:${esc(summary)}`);
    if (p.location) lines.push(`LOCATION:${esc(p.location)}`);
    const descParts = [
      p.workType ? `依頼名: ${p.workType}` : "",
      user.role === "ADMIN" && p.assignedTo ? `担当: ${p.assignedTo.companyName || p.assignedTo.name}` : "",
      `${baseUrl}/projects/${p.id}`,
    ].filter(Boolean);
    lines.push(`DESCRIPTION:${esc(descParts.join("\n"))}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="visits.ics"',
      "Cache-Control": "no-cache",
    },
  });
}
