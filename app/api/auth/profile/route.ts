import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true, phone: true, thankYouEnabled: true, thankYouImageUrl: true, thankYouMessage: true, color: true },
  });
  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const body = await req.json();

  // カラー選択（パートナーのみ・未設定の場合のみ）
  if ("color" in body) {
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { color: true } });
    if (current?.color) {
      return NextResponse.json({ error: "カラーは一度設定すると変更できません" }, { status: 403 });
    }
    await prisma.user.update({ where: { id: userId }, data: { color: body.color || null } });
    return NextResponse.json({ ok: true });
  }

  const updateData: { avatarUrl?: string | null; phone?: string | null; thankYouEnabled?: boolean; thankYouImageUrl?: string | null; thankYouMessage?: string | null } = {};
  if ("avatarUrl" in body) updateData.avatarUrl = body.avatarUrl || null;
  if ("phone" in body) updateData.phone = body.phone?.trim() || null;
  if ("thankYouEnabled" in body) updateData.thankYouEnabled = Boolean(body.thankYouEnabled);
  if ("thankYouImageUrl" in body) updateData.thankYouImageUrl = body.thankYouImageUrl || null;
  if ("thankYouMessage" in body) updateData.thankYouMessage = body.thankYouMessage || null;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { avatarUrl: true, phone: true, thankYouEnabled: true, thankYouImageUrl: true, thankYouMessage: true, color: true },
  });

  return NextResponse.json(user);
}
