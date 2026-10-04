import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { del } from "@vercel/blob";

// PATCH: 報告写真の名前を変更（管理者のみ。積水へ報告し直す時に分かりやすい名前にする用）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { originalName } = await req.json();
  if (typeof originalName !== "string" || !originalName.trim()) {
    return NextResponse.json({ error: "名前が空です" }, { status: 400 });
  }
  const photo = await prisma.photo.update({
    where: { id },
    data: { originalName: originalName.trim().slice(0, 100) },
    select: { id: true, originalName: true },
  });
  return NextResponse.json(photo);
}

// DELETE: 報告写真を削除（管理者のみ。不要な写真の整理用）
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id }, select: { filename: true } });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    if (photo.filename.startsWith("http")) await del(photo.filename);
  } catch { /* Blob削除失敗は無視（DB行は消す） */ }
  await prisma.photo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
