import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
};

// 依頼書原本（添付写真）を画面表示用に中継。管理者のみ・依頼書原本のみ許可。
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const photoId = req.nextUrl.searchParams.get("photo") || "";

  const photo = await prisma.projectPhoto.findFirst({ where: { id: photoId, projectId: id } });
  // 依頼書原本以外は中継しない（安全側）
  if (!photo || !photo.originalName.includes("依頼書原本") || !photo.filename.startsWith("http")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const upstream = await fetch(photo.filename);
  if (!upstream.ok) return new NextResponse("Fetch failed", { status: 502 });
  let ct = upstream.headers.get("content-type") || "";
  if (!ct || ct === "application/octet-stream") {
    const ext = (photo.originalName || photo.filename).split("?")[0].split(".").pop()?.toLowerCase() || "";
    ct = EXT_TYPES[ext] || "application/pdf";
  }
  return new NextResponse(upstream.body, {
    headers: { "Content-Type": ct, "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600" },
  });
}
