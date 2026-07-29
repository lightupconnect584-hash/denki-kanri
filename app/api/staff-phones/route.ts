import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 担当者番号リスト（管理者のみ）。折り返し先への担当者連絡先の混入を自動除外するために使う
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return !!session?.user && (session.user as { role?: string })?.role === "ADMIN";
}

const normPhone = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const phones = await prisma.staffPhone.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(phones);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const phone = normPhone(body.phone);
  if (phone.length < 10) return NextResponse.json({ error: "電話番号が正しくありません" }, { status: 400 });
  const label = String(body.label ?? "").trim();
  const item = await prisma.staffPhone.upsert({
    where: { phone },
    update: { label: label || undefined },
    create: { phone, label },
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.staffPhone.delete({ where: { id: String(body.id) } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
