import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put, del } from "@vercel/blob";

export const maxDuration = 60;

// POST: 写真/PDFをプロジェクトに追加
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const blob = await put(file.name, file, {
    access: "public",
    addRandomSuffix: true,
  });

  const photo = await prisma.projectPhoto.create({
    data: {
      filename: blob.url,
      originalName: file.name,
      projectId: params.id,
    },
  });

  return NextResponse.json(photo);
}

// DELETE: 写真/PDFをプロジェクトから削除（管理者のみ）
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { photoId } = await req.json();
  if (!photoId) return NextResponse.json({ error: "photoId required" }, { status: 400 });

  const photo = await prisma.projectPhoto.findFirst({
    where: { id: photoId, projectId: params.id },
  });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Vercel Blob から削除
  try {
    if (photo.filename.startsWith("http")) {
      await del(photo.filename);
    }
  } catch {
    // Blob削除失敗しても続行
  }

  await prisma.projectPhoto.delete({ where: { id: photoId } });

  return NextResponse.json({ ok: true });
}
