import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 書き込み可能なGoogleカレンダー一覧の取得（GET）と、書き込み先の設定（PATCH）
async function accessToken(refreshToken: string): Promise<string | null> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) return null;
  return (await r.json()).access_token || null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleRefreshToken: true, googleCalendarId: true },
  });
  if (!user?.googleRefreshToken) return NextResponse.json({ calendars: [], selected: null });
  const token = await accessToken(user.googleRefreshToken);
  if (!token) return NextResponse.json({ calendars: [], selected: null });

  const r = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return NextResponse.json({ calendars: [], selected: user.googleCalendarId, noPermission: true });
  const j = await r.json();
  // 書き込み権限があるカレンダーのみ（owner / writer）
  const calendars = (j.items || [])
    .filter((c: { accessRole?: string }) => c.accessRole === "owner" || c.accessRole === "writer")
    .map((c: { id: string; summary: string; primary?: boolean }) => ({ id: c.id, name: c.summary, primary: !!c.primary }));
  return NextResponse.json({ calendars, selected: user.googleCalendarId });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { calendarId } = await req.json();
  await prisma.user.update({
    where: { id: userId },
    data: { googleCalendarId: calendarId || null },
  });
  return NextResponse.json({ ok: true });
}
