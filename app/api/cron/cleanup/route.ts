import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  // 完了から1年以上経った案件のIDを取得
  const old = await prisma.project.findMany({
    where: {
      status: { in: DONE_STATUSES },
      updatedAt: { lt: cutoff },
    },
    select: { id: true },
  });

  if (old.length === 0) {
    return NextResponse.json({ deletedPhotos: 0, deletedProjectPhotos: 0 });
  }

  const ids = old.map((p) => p.id);

  // 検査写真を削除（Photo = before/after写真）
  const { count: photoCount } = await prisma.photo.deleteMany({
    where: { inspection: { projectId: { in: ids } } },
  });

  // 依頼添付写真を削除（ProjectPhoto）
  const { count: projectPhotoCount } = await prisma.projectPhoto.deleteMany({
    where: { projectId: { in: ids } },
  });

  return NextResponse.json({
    deletedPhotos: photoCount,
    deletedProjectPhotos: projectPhotoCount,
    affectedProjects: ids.length,
  });
}
