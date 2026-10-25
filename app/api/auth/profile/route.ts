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
  serviceAreas: true,
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
    serviceAreas?: string[];
  } = {};
  if ("avatarUrl" in body) updateData.avatarUrl = body.avatarUrl || null;
  if ("phone" in body) updateData.phone = body.phone?.trim() || null;
  if ("thankYouEnabled" in body) updateData.thankYouEnabled = Boolean(body.thankYouEnabled);
  if ("thankYouImageUrl" in body) updateData.thankYouImageUrl = body.thankYouImageUrl || null;
  if ("thankYouMessage" in body) updateData.thankYouMessage = body.thankYouMessage || null;
  if ("serviceAreas" in body && Array.isArray(body.serviceAreas)) {
    updateData.serviceAreas = body.serviceAreas
      .map((v: unknown) => String(v).trim().replace(/[\s\u3000]+/g, ""))
      .filter((v: string) => v.length > 0)
      .slice(0, 50);
    // 対応エリアの変更を管理者へ通知（把握用）
    try {
      const { sendPushToUsers, getAdminIds } = await import("@/lib/push");
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, companyName: true } });
      const adminIds = await getAdminIds();
      await sendPushToUsers(adminIds, {
        title: "📍 対応エリアが更新されました",
        body: `${me?.companyName || me?.name || "協力会社"}: ${(updateData.serviceAreas as string[]).join("・") || "（空）"}`,
        url: "/users",
      });
    } catch { /* 通知失敗は無視 */ }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: profileSelect,
  });

  return NextResponse.json(user);
}
