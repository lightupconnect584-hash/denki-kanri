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

  // 読み込むカレンダー一覧を取得（権限があれば全カレンダー、なければprimaryのみ）
  let calendarIds: string[] = ["primary"];
  try {
    const clRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (clRes.ok) {
      const cl = await clRes.json();
      const ids = (cl.items || [])
        .filter((c: { selected?: boolean; id: string }) => c.selected !== false) // 非表示カレンダーは除外
        .map((c: { id: string }) => c.id);
      if (ids.length > 0) calendarIds = ids;
    }
  } catch { /* primaryのみで続行 */ }

  // アプリが書き込んだ予定（訪問予定）は除外して二重表示を防ぐ
  const mine = await prisma.googleEvent.findMany({ where: { userId }, select: { googleEventId: true } });
  const mineIds = new Set(mine.map((x) => x.googleEventId));

  type GEvent = { id: string; title: string; start: string; end: string | null; allDay: boolean };
  const all: GEvent[] = [];
  const seen = new Set<string>();

  for (const calId of calendarIds) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    const er = await fetch(url.toString(), { headers: { Authorization: `Bearer ${access_token}` } });
    if (!er.ok) continue;
    const json = await er.json();
    for (const ev of json.items || []) {
      if (mineIds.has(ev.id) || ev.status === "cancelled" || seen.has(ev.id)) continue;
      // アプリの訪問予定（🔌）は購読フィード等から重複しても除外
      const title = ev.summary || "（無題）";
      if (title.startsWith("🔌")) continue;
      const start = ev.start?.dateTime || ev.start?.date || null;
      if (!start) continue;
      seen.add(ev.id);
      all.push({
        id: ev.id,
        title,
        start,
        end: ev.end?.dateTime || ev.end?.date || null,
        allDay: !ev.start?.dateTime,
      });
    }
  }

  return NextResponse.json({ events: all, connected: true });
}
