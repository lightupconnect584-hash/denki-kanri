import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 連携中ユーザーのGoogleカレンダー予定を返す（アプリ内カレンダーに表示する用）
// 本人の予定のみ。アプリが書き込んだ訪問予定は除外（二重表示防止）。
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const month = req.nextUrl.searchParams.get("month") || ""; // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ events: [] });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleRefreshToken: true },
  });
  if (!user?.googleRefreshToken || !process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ events: [], connected: false });
  }

  // access token
  const tr = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: user.googleRefreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tr.ok) return NextResponse.json({ events: [], connected: false });
  const { access_token } = await tr.json();
  if (!access_token) return NextResponse.json({ events: [], connected: false });

  const [y, m] = month.split("-").map(Number);
  const timeMin = new Date(y, m - 1, 1).toISOString();
  const timeMax = new Date(y, m, 1).toISOString();

  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");

  const er = await fetch(url.toString(), { headers: { Authorization: `Bearer ${access_token}` } });
  if (!er.ok) return NextResponse.json({ events: [] });
  const json = await er.json();

  // アプリが書き込んだ予定（訪問予定）は除外して二重表示を防ぐ
  const mine = await prisma.googleEvent.findMany({ where: { userId }, select: { googleEventId: true } });
  const mineIds = new Set(mine.map((x) => x.googleEventId));

  const events = (json.items || [])
    .filter((ev: { id: string; status?: string }) => !mineIds.has(ev.id) && ev.status !== "cancelled")
    .map((ev: { id: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }) => ({
      id: ev.id,
      title: ev.summary || "（無題）",
      start: ev.start?.dateTime || ev.start?.date || null,
      end: ev.end?.dateTime || ev.end?.date || null,
      allDay: !ev.start?.dateTime,
    }))
    .filter((ev: { start: string | null }) => ev.start);

  return NextResponse.json({ events, connected: true });
}
