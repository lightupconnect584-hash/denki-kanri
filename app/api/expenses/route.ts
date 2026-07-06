import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if ((session.user as { role?: string })?.role !== "ADMIN") return null;
  return session;
}

// POST: 経費項目を追加
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });

  const max = await prisma.expenseItem.aggregate({ _max: { order: true } });
  const item = await prisma.expenseItem.create({
    data: {
      label,
      amount: Number(body.amount) || 0,
      order: (max._max.order ?? -1) + 1,
    },
  });
  return NextResponse.json(item);
}

// PATCH: 経費項目を更新
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = String(body.label);
  if (body.amount !== undefined) data.amount = Number(body.amount) || 0;

  const item = await prisma.expenseItem.update({ where: { id: body.id }, data });
  return NextResponse.json(item);
}

// DELETE: 経費項目を削除
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.expenseItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
