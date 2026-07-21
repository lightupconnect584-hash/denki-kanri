import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 取引先マスター（管理者のみ）

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if ((session.user as { role?: string })?.role !== "ADMIN") return null;
  return session;
}

// GET: 取引先一覧（?all=1 でアーカイブ含む）
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = req.nextUrl.searchParams.get("all") === "1";
  const clients = await prisma.client.findMany({
    where: all ? {} : { archived: false },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(clients);
}

// POST: 取引先を追加
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "名前が必要です" }, { status: 400 });
  const max = await prisma.client.aggregate({ _max: { order: true } });
  const client = await prisma.client.create({
    data: { name, color: body.color || null, order: (max._max.order ?? -1) + 1 },
  });
  return NextResponse.json(client);
}

// PATCH: 取引先を更新（名前・色・アーカイブ）
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.color !== undefined) data.color = body.color || null;
  if (body.archived !== undefined) data.archived = Boolean(body.archived);
  if (body.order !== undefined) data.order = Number(body.order) || 0;
  if (body.feePercent !== undefined) data.feePercent = Math.max(0, Math.min(100, Number(body.feePercent) || 0));
  const client = await prisma.client.update({ where: { id: body.id }, data });
  return NextResponse.json(client);
}
