import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

// GET: アプリ設定を取得（認証済みなら誰でも。締め日は集計の共通ルールのため協力会社も参照）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setting = await prisma.appSetting.findUnique({ where: { id: SINGLETON_ID } });
  return NextResponse.json({ billingCloseDay: setting?.billingCloseDay ?? 31 });
}

// PATCH: 締め日を更新（管理者のみ）
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  let day = Number(body.billingCloseDay);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return NextResponse.json({ error: "締め日は1〜31で指定してください" }, { status: 400 });
  }
  day = Math.max(1, Math.min(31, day));

  const setting = await prisma.appSetting.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, billingCloseDay: day },
    update: { billingCloseDay: day },
  });
  return NextResponse.json({ billingCloseDay: setting.billingCloseDay });
}
