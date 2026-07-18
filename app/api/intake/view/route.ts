import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 依頼書原本をブラウザ内で表示するためのプロキシ
// Blob直リンクは「ダウンロード用」として返るため、ここで inline + 正しいContent-Type に整えて返す

export const dynamic = "force-dynamic";

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  // 依頼書原本は管理者のみ（協力会社には依頼書の存在ごと非公開）
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return new NextResponse("Not found", { status: 404 });
  }

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return new NextResponse("Not found", { status: 404 });

  const doc = await prisma.intakeDoc.findUnique({ where: { id } });
  if (!doc || !doc.filename.startsWith("http")) return new NextResponse("Not found", { status: 404 });

  const upstream = await fetch(doc.filename);
  if (!upstream.ok) return new NextResponse("Fetch failed", { status: 502 });

  // Content-Type: 上流のものを使い、不明ならファイル名の拡張子から推定
  let contentType = upstream.headers.get("content-type") || "";
  if (!contentType || contentType === "application/octet-stream") {
    const ext = (doc.originalName || doc.filename).split("?")[0].split(".").pop()?.toLowerCase() || "";
    contentType = EXT_TYPES[ext] || "application/pdf";
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
