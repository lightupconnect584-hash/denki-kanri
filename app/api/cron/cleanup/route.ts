import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { del } from "@vercel/blob";

export const maxDuration = 60;

const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];
// 完了からこの月数を過ぎた案件の現場写真を削除（請求書・PDFは対象外）
const RETENTION_MONTHS = 6;

export async function GET(req: NextRequest) {
  // Vercel Cron は CRON_SECRET を付与。管理者は手動実行も可。
  const auth = req.headers.get("authorization");
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  let adminOk = false;
  if (!cronOk) {
    const session = await getServerSession(authOptions);
    adminOk = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  }
  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  // 完了から一定期間経った案件の写真を、Blob実体ごと取得
  const old = await prisma.project.findMany({
    where: {
      status: { in: DONE_STATUSES },
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      projectPhotos: { select: { id: true, filename: true } },
      inspections: { select: { photos: { select: { id: true, filename: true } } } },
    },
  });

  let deletedBlobs = 0;
  let deletedPhotos = 0;
  let deletedProjectPhotos = 0;
  let affectedProjects = 0;

  for (const p of old) {
    const inspPhotoIds: string[] = [];
    const projPhotoIds: string[] = [];
    const urls: string[] = [];

    for (const ph of p.projectPhotos) {
      projPhotoIds.push(ph.id);
      if (ph.filename.startsWith("http")) urls.push(ph.filename);
    }
    for (const insp of p.inspections) {
      for (const ph of insp.photos) {
        inspPhotoIds.push(ph.id);
        if (ph.filename.startsWith("http")) urls.push(ph.filename);
      }
    }

    if (inspPhotoIds.length === 0 && projPhotoIds.length === 0) continue;

    // 先に Blob 実体を削除（これをしないと容量が空かない）
    for (const url of urls) {
      try {
        await del(url);
        deletedBlobs++;
      } catch {
        // 失敗しても続行
      }
    }

    if (inspPhotoIds.length > 0) {
      const r = await prisma.photo.deleteMany({ where: { id: { in: inspPhotoIds } } });
      deletedPhotos += r.count;
    }
    if (projPhotoIds.length > 0) {
      const r = await prisma.projectPhoto.deleteMany({ where: { id: { in: projPhotoIds } } });
      deletedProjectPhotos += r.count;
    }
    affectedProjects++;
  }

  return NextResponse.json({
    retentionMonths: RETENTION_MONTHS,
    affectedProjects,
    deletedBlobs,
    deletedPhotos,
    deletedProjectPhotos,
  });
}
