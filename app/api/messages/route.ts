import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers, getAdminIds } from "@/lib/push";

const userSelect = {
  id: true,
  name: true,
  companyName: true,
  avatarUrl: true,
  role: true,
  color: true,
};

// GET /api/messages              → 会話一覧（最新メッセージ + 未読数）
// GET /api/messages?userId=xxx  → 特定ユーザーとのスレッド
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const myId = (session.user as { id: string }).id;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  // スレッド取得
  if (userId) {
    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { fromId: myId, toId: userId },
          { fromId: userId, toId: myId },
        ],
      },
      include: {
        from: { select: userSelect },
        to: { select: userSelect },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(messages);
  }

  // 会話一覧
  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [{ fromId: myId }, { toId: myId }],
    },
    include: {
      from: { select: userSelect },
      to: { select: userSelect },
    },
    orderBy: { createdAt: "desc" },
  });

  // 会話相手ごとにグループ化
  const threadMap = new Map<string, {
    partner: typeof messages[0]["from"];
    lastMessage: typeof messages[0];
    unreadCount: number;
  }>();

  for (const msg of messages) {
    const partnerId = msg.fromId === myId ? msg.toId : msg.fromId;
    const partner = msg.fromId === myId ? msg.to : msg.from;
    if (!threadMap.has(partnerId)) {
      threadMap.set(partnerId, { partner, lastMessage: msg, unreadCount: 0 });
    }
    // 自分宛て未読
    if (msg.toId === myId && !msg.readAt) {
      threadMap.get(partnerId)!.unreadCount++;
    }
  }

  const threads = Array.from(threadMap.values()).sort(
    (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
  );

  return NextResponse.json(threads);
}

// POST /api/messages → { toId, content }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const myId = (session.user as { id: string }).id;
  const myName = (session.user as { name?: string }).name || "ユーザー";
  const myRole = (session.user as { role?: string }).role;

  const body = await req.json();
  if (!body.toId || !body.content?.trim()) {
    return NextResponse.json({ error: "toId and content required" }, { status: 400 });
  }

  const msg = await prisma.directMessage.create({
    data: {
      fromId: myId,
      toId: body.toId,
      content: body.content.trim(),
    },
    include: {
      from: { select: userSelect },
      to: { select: userSelect },
    },
  });

  // プッシュ通知（自分宛て＝マイチャットはスキップ）
  if (body.toId !== myId) {
    try {
      const notifBody = `${myName}：${body.content.trim().slice(0, 60)}`;
      if (myRole === "ADMIN") {
        await sendPushToUsers([body.toId], {
          title: "💬 メッセージが届きました",
          body: notifBody,
          url: "/messages",
        });
      } else {
        const adminIds = await getAdminIds();
        await sendPushToUsers(adminIds, {
          title: "💬 メッセージが届きました",
          body: notifBody,
          url: "/messages",
        });
      }
    } catch { /* 通知失敗はスルー */ }
  }

  return NextResponse.json(msg);
}

// PATCH /api/messages?userId=xxx → 既読にする
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const myId = (session.user as { id: string }).id;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.directMessage.updateMany({
    where: {
      fromId: userId,
      toId: myId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
