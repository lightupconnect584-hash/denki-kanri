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

// PATCH: 現場写真を完了報告の写真へ移動（管理者のみ）
//   body: { photoId, toInspectionId }
//   協力会社が報告に入り切らなかった写真を現場写真に上げた時の整理用。ファイルは同じURLを使い回す
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { photoId, toInspectionId } = await req.json();
  if (!photoId || !toInspectionId) return NextResponse.json({ error: "photoId, toInspectionId required" }, { status: 400 });

  const photo = await prisma.projectPhoto.findFirst({ where: { id: photoId, projectId: params.id } });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const inspection = await prisma.inspection.findFirst({
    where: { id: toInspectionId, projectId: params.id },
    select: { id: true, _count: { select: { photos: true } } },
  });
  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inspection._count.photos >= 12) {
    return NextResponse.json({ error: "完了報告の写真が上限（12枚）です。先に報告側を整理してください" }, { status: 400 });
  }

  await prisma.photo.create({
    data: {
      inspectionId: inspection.id,
      filename: photo.filename,
      originalName: photo.originalName,
      category: "other",
      order: 999, // 末尾（並び替えで調整可能）
    },
  });
  // DB行のみ削除（Blobの実体は報告側で使い続ける）
  await prisma.projectPhoto.delete({ where: { id: photo.id } });
  return NextResponse.json({ ok: true });
}
