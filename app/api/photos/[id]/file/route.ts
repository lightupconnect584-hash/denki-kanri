import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

// GET: 報告写真を「設定した名前」のファイルとして配信（管理者のみ）
// ドラッグ保存・まとめてダウンロードで正しいファイル名にするための同一オリジン配信
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id }, select: { filename: true, originalName: true } });
  if (!photo || !photo.filename.startsWith("http")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const upstream = await fetch(photo.filename);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 502 });
  }

  // ?name= で未保存の名前も指定可能（保存済みはDBの名前）
  const nameParam = req.nextUrl.searchParams.get("name");
  let name = (nameParam || photo.originalName || "photo").trim().slice(0, 100) || "photo";
  if (!/\.(jpe?g|png|gif|webp|heic|pdf)$/i.test(name)) name += ".jpg";

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
