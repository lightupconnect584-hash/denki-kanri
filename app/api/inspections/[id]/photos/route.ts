import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: 完了報告に写真を後から追加（管理者のみ）
//   body: { photos: [{ filename, originalName, category }] }（filenameは/api/uploadで取得したURL）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    select: { id: true, _count: { select: { photos: true } } },
  });
  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const photos = Array.isArray(body.photos) ? body.photos : [];
  const valid = photos.filter(
    (p: { filename?: unknown; originalName?: unknown }) =>
      typeof p?.filename === "string" && p.filename.startsWith("http") && typeof p?.originalName === "string"
  );
  if (valid.length === 0) return NextResponse.json({ error: "photos required" }, { status: 400 });

  const MAX = 12;
  const remaining = MAX - inspection._count.photos;
  if (remaining <= 0) return NextResponse.json({ error: `写真は合計${MAX}枚までです` }, { status: 400 });

  const toAdd = valid.slice(0, remaining);
  await prisma.photo.createMany({
    data: toAdd.map((p: { filename: string; originalName: string; category?: string }) => ({
      inspectionId: id,
      filename: p.filename,
      originalName: String(p.originalName).slice(0, 100),
      category: ["before", "during", "after", "other"].includes(String(p.category)) ? String(p.category) : "other",
    })),
  });
  return NextResponse.json({ added: toAdd.length, skipped: valid.length - toAdd.length });
}

// PATCH: 写真の並び順を保存（管理者のみ）
//   body: { photoIds: ["id1","id2",...] } の順にorderを振り直す
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { photoIds } = await req.json();
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return NextResponse.json({ error: "photoIds required" }, { status: 400 });
  }
  // この報告に属する写真だけを対象にする
  const photos = await prisma.photo.findMany({ where: { inspectionId: id }, select: { id: true } });
  const valid = new Set(photos.map((p) => p.id));
  let order = 0;
  for (const pid of photoIds) {
    if (typeof pid === "string" && valid.has(pid)) {
      await prisma.photo.update({ where: { id: pid }, data: { order: order++ } });
    }
  }
  return NextResponse.json({ ok: true });
}
