import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// オートロック解除番号の管理（一覧・登録・編集・削除は管理者のみ。
// 協力会社には案件詳細APIで該当建物の番号だけ表示される）
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return !!session?.user && (session.user as { role?: string })?.role === "ADMIN";
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const codes = await prisma.autolockCode.findMany({ orderBy: { buildingName: "asc" } });
  return NextResponse.json(codes);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const buildingName = String(body.buildingName || "").trim();
  const code = String(body.code || "").trim();
  if (!buildingName || !code) return NextResponse.json({ error: "建物名と番号は必須です" }, { status: 400 });
  const item = await prisma.autolockCode.create({
    data: { buildingName, code, address: String(body.address || "").trim() || null, note: String(body.note || "").trim() || null },
  });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: Record<string, string | null> = {};
  if (body.buildingName !== undefined) data.buildingName = String(body.buildingName).trim();
  if (body.code !== undefined) data.code = String(body.code).trim();
  if (body.address !== undefined) data.address = String(body.address || "").trim() || null;
  if (body.note !== undefined) data.note = String(body.note || "").trim() || null;
  const item = await prisma.autolockCode.update({ where: { id: body.id }, data });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.autolockCode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
