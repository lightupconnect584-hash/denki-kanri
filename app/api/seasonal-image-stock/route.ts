import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const images = await prisma.seasonalImageStock.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(images);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const img = await prisma.seasonalImageStock.create({
    data: { filename: body.filename, originalName: body.originalName, label: body.label || null },
  });
  return NextResponse.json(img);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, label } = await req.json();
  const img = await prisma.seasonalImageStock.update({ where: { id }, data: { label } });
  return NextResponse.json(img);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const img = await prisma.seasonalImageStock.findUnique({ where: { id } });
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.seasonalImageStock.delete({ where: { id } });

  try {
    const filePath = path.join(process.cwd(), "public", "uploads", img.filename);
    await unlink(filePath);
  } catch {
    // file may not exist on this server instance
  }

  return NextResponse.json({ ok: true });
}
