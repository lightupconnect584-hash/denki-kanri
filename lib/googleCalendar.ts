import { prisma } from "./prisma";

// Googleカレンダー連携（OAuth・即時書き込み）
// - ユーザーごとに refresh token を保持し、訪問予定を本物のGoogleカレンダー予定として書き込む
// - 対象: 連携済みの管理者（全案件）＋連携済みの担当協力会社（自分の案件）
// 環境変数 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定なら全て何もしない

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

// refresh token → access token
async function getAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.access_token || null;
  } catch {
    return null;
  }
}

// "9:30〜11:00" / "9時〜11時" 形式の時間帯をパース
function parseVisitTime(t: string | null): { from: [number, number] | null; to: [number, number] | null } {
  if (!t) return { from: null, to: null };
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(?:時)?〜(?:(\d{1,2})(?::(\d{2}))?(?:時)?)?/);
  if (!m) return { from: null, to: null };
  const from: [number, number] = [parseInt(m[1]), m[2] ? parseInt(m[2]) : 0];
  const to: [number, number] | null = m[3] ? [parseInt(m[3]), m[4] ? parseInt(m[4]) : 0] : null;
  return { from, to };
}

type ProjectForSync = {
  id: string;
  title: string;
  location: string | null;
  roomNumber: string | null;
  workType: string | null;
  visitDate: Date | null;
  visitTime: string | null;
  status: string;
  assignedToId: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function buildEventBody(p: ProjectForSync) {
  const d = p.visitDate!;
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const { from, to } = parseVisitTime(p.visitTime);
  const baseUrl = process.env.NEXTAUTH_URL || "https://denki-kanri.vercel.app";

  let start: Record<string, string>;
  let end: Record<string, string>;
  if (from) {
    const e: [number, number] = to ?? [Math.min(from[0] + 1, 23), from[1]];
    start = { dateTime: `${y}-${pad(mo)}-${pad(day)}T${pad(from[0])}:${pad(from[1])}:00`, timeZone: "Asia/Tokyo" };
    end = { dateTime: `${y}-${pad(mo)}-${pad(day)}T${pad(e[0])}:${pad(e[1])}:00`, timeZone: "Asia/Tokyo" };
  } else {
    const next = new Date(y, mo - 1, day + 1);
    start = { date: `${y}-${pad(mo)}-${pad(day)}` };
    end = { date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` };
  }

  return {
    summary: `🔌 ${p.title}${p.roomNumber ? ` ${p.roomNumber}` : ""}`,
    location: p.location || undefined,
    description: [p.workType ? `依頼名: ${p.workType}` : "", `${baseUrl}/projects/${p.id}`].filter(Boolean).join("\n"),
    start,
    end,
  };
}

// 1ユーザー分のイベントを作成/更新/削除
async function syncForUser(userId: string, refreshToken: string, p: ProjectForSync, shouldExist: boolean): Promise<void> {
  const mapping = await prisma.googleEvent.findUnique({
    where: { userId_projectId: { userId, projectId: p.id } },
  });

  if (!shouldExist) {
    if (!mapping) return;
    const token = await getAccessToken(refreshToken);
    if (token) {
      await fetch(`${CAL_API}/${mapping.googleEventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    await prisma.googleEvent.delete({ where: { id: mapping.id } }).catch(() => {});
    return;
  }

  const token = await getAccessToken(refreshToken);
  if (!token) return;
  const body = JSON.stringify(buildEventBody(p));

  if (mapping) {
    const res = await fetch(`${CAL_API}/${mapping.googleEventId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    });
    if (res.ok) return;
    // イベントがGoogle側で消されていた場合は作り直し
    await prisma.googleEvent.delete({ where: { id: mapping.id } }).catch(() => {});
  }

  const res = await fetch(CAL_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  if (res.ok) {
    const json = await res.json();
    if (json.id) {
      await prisma.googleEvent.create({
        data: { userId, projectId: p.id, googleEventId: json.id },
      }).catch(() => {});
    }
  }
}

// 案件のGoogleカレンダー同期（連携済みの管理者全員＋担当者）
export async function syncProjectToGoogle(projectId: string): Promise<void> {
  if (!googleConfigured()) return;
  try {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, title: true, location: true, roomNumber: true, workType: true,
        visitDate: true, visitTime: true, status: true, assignedToId: true,
      },
    });
    if (!p) return;

    // 予定が存在すべき条件: 訪問日あり・却下でない
    const shouldExist = !!p.visitDate && p.status !== "REJECTED";

    // 対象ユーザー: 連携済みの管理者 + 連携済みの担当者
    const users = await prisma.user.findMany({
      where: {
        googleRefreshToken: { not: null },
        OR: [{ role: "ADMIN" }, { id: p.assignedToId ?? "__none__" }],
      },
      select: { id: true, googleRefreshToken: true },
    });
    const targetIds = new Set(users.map((u) => u.id));

    // 担当変更などで対象外になったユーザーのイベントを削除
    const mappings = await prisma.googleEvent.findMany({ where: { projectId } });
    for (const m of mappings) {
      if (!targetIds.has(m.userId)) {
        const u = await prisma.user.findUnique({ where: { id: m.userId }, select: { googleRefreshToken: true } });
        if (u?.googleRefreshToken) {
          const token = await getAccessToken(u.googleRefreshToken);
          if (token) {
            await fetch(`${CAL_API}/${m.googleEventId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
          }
        }
        await prisma.googleEvent.delete({ where: { id: m.id } }).catch(() => {});
      }
    }

    await Promise.all(
      users.map((u) => syncForUser(u.id, u.googleRefreshToken!, p, shouldExist).catch(() => {}))
    );
  } catch {
    // 同期失敗で本処理を止めない
  }
}

// 案件削除時: 全ユーザーのイベントを削除
export async function deleteProjectFromGoogle(projectId: string): Promise<void> {
  if (!googleConfigured()) return;
  try {
    const mappings = await prisma.googleEvent.findMany({ where: { projectId } });
    for (const m of mappings) {
      const u = await prisma.user.findUnique({ where: { id: m.userId }, select: { googleRefreshToken: true } });
      if (u?.googleRefreshToken) {
        const token = await getAccessToken(u.googleRefreshToken);
        if (token) {
          await fetch(`${CAL_API}/${m.googleEventId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      }
    }
    await prisma.googleEvent.deleteMany({ where: { projectId } });
  } catch { /* ignore */ }
}
