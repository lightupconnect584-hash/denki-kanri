import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  // mine=true のとき自分宛のみ返す（ダッシュボード用）
  const mine = new URL(req.url).searchParams.get("mine") === "true";

  const messages = await prisma.seasonalMessage.findMany({
    orderBy: [{ order: "asc" }, { startMD: "asc" }],
  });

  if (mine) {
    return NextResponse.json(
      messages.filter((m) => m.targetType === "all" || m.targetUserIds.includes(userId))
    );
  }

  // 管理者は全件、パートナーは自分宛のみ
  if (role !== "ADMIN") {
    return NextResponse.json(
      messages.filter((m) => m.targetType === "all" || m.targetUserIds.includes(userId))
    );
  }

  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const msg = await prisma.seasonalMessage.create({
    data: {
      name: body.name,
      startMD: body.startMD,
      endMD: body.endMD,
      message: body.message,
      imageUrl: body.imageUrl || null,
      animation: body.animation || "none",
      enabled: body.enabled ?? true,
      order: body.order ?? 0,
      targetType: body.targetType || "all",
      targetUserIds: body.targetUserIds || [],
    },
  });
  return NextResponse.json(msg);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, ...data } = body;
  const msg = await prisma.seasonalMessage.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.startMD !== undefined && { startMD: data.startMD }),
      ...(data.endMD !== undefined && { endMD: data.endMD }),
      ...(data.message !== undefined && { message: data.message }),
      ...("imageUrl" in data && { imageUrl: data.imageUrl }),
      ...(data.animation !== undefined && { animation: data.animation }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.targetType !== undefined && { targetType: data.targetType }),
      ...(data.targetUserIds !== undefined && { targetUserIds: data.targetUserIds }),
    },
  });
  return NextResponse.json(msg);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.seasonalMessage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
