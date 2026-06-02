import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const profileSelect = {
  avatarUrl: true,
  phone: true,
  companyName: true,
  thankYouEnabled: true,
  thankYouImageUrl: true,
  thankYouMessage: true,
  color: true,
  // 基本情報
  address: true,
  birthDate: true,
  bloodType: true,
  emergencyName: true,
  emergencyPhone: true,
  licenseType: true,
  licenseNumber: true,
  licenseExpiry: true,
  vehicleNumber: true,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: profileSelect });

  // 他の協力会社が使用している色一覧（色選択の排他制御用）
  const usedColors = await prisma.user.findMany({
    where: { role: "PARTNER", color: { not: null }, id: { not: userId } },
    select: { color: true },
  });

  return NextResponse.json({
    ...user,
    usedColors: usedColors.map(u => u.color).filter(Boolean) as string[],
  });
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

  // 基本情報の更新
  if ("basicInfo" in body) {
    const d = body.basicInfo;
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(d.companyName !== undefined ? { companyName: d.companyName?.trim() || null } : {}),
        address:        d.address?.trim()        || null,
        birthDate:      d.birthDate              ? new Date(d.birthDate) : null,
        bloodType:      d.bloodType              || null,
        emergencyName:  d.emergencyName?.trim()  || null,
        emergencyPhone: d.emergencyPhone?.trim() || null,
        licenseType:    d.licenseType            || null,
        licenseNumber:  d.licenseNumber?.trim()  || null,
        licenseExpiry:  d.licenseExpiry          ? new Date(d.licenseExpiry) : null,
        vehicleNumber:  d.vehicleNumber?.trim()  || null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const updateData: {
    avatarUrl?: string | null;
    phone?: string | null;
    thankYouEnabled?: boolean;
    thankYouImageUrl?: string | null;
    thankYouMessage?: string | null;
  } = {};
  if ("avatarUrl" in body) updateData.avatarUrl = body.avatarUrl || null;
  if ("phone" in body) updateData.phone = body.phone?.trim() || null;
  if ("thankYouEnabled" in body) updateData.thankYouEnabled = Boolean(body.thankYouEnabled);
  if ("thankYouImageUrl" in body) updateData.thankYouImageUrl = body.thankYouImageUrl || null;
  if ("thankYouMessage" in body) updateData.thankYouMessage = body.thankYouMessage || null;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: profileSelect,
  });

  return NextResponse.json(user);
}
