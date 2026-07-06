import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DONE_STATUSES = ["CONFIRMED", "COMPLETED"];

// 埼玉県の主な市町村（場所から積水 埼玉/北関東を推定するための簡易判定）
const SAITAMA_HINTS = [
  "埼玉", "さいたま", "川口", "上尾", "深谷", "新座", "入間", "和光", "川越",
  "熊谷", "蓮田", "蕨", "日高", "所沢", "越谷", "草加", "春日部", "狭山",
  "久喜", "桶川", "北本", "鴻巣", "行田", "加須", "羽生", "本庄", "東松山",
  "朝霞", "志木", "富士見", "ふじみ野", "三郷", "八潮", "吉川", "戸田", "鶴ヶ島", "坂戸", "飯能",
];

// POST: 指定月で締めた完了案件を売上明細に取り込む（未取り込み分のみ）
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const month = String(body.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }

  // その月で締めた完了案件のうち、まだ取り込んでいないもの
  const imported = await prisma.salesEntry.findMany({
    where: { projectId: { not: null } },
    select: { projectId: true },
  });
  const importedIds = new Set(imported.map((e) => e.projectId));

  const projects = await prisma.project.findMany({
    where: {
      status: { in: DONE_STATUSES },
      billingMonth: month,
    },
    select: { id: true, title: true, location: true, amount: true },
    orderBy: { createdAt: "asc" },
  });
  const targets = projects.filter((p) => !importedIds.has(p.id));

  if (targets.length === 0) return NextResponse.json({ imported: 0 });

  const max = await prisma.salesEntry.aggregate({
    where: { yearMonth: month },
    _max: { order: true },
  });
  let order = (max._max.order ?? -1) + 1;

  for (const p of targets) {
    const isSaitama = SAITAMA_HINTS.some((h) => p.location.includes(h));
    await prisma.salesEntry.create({
      data: {
        yearMonth: month,
        category: isSaitama ? "SEKISUI_SAITAMA" : "SEKISUI_KITA",
        label: p.title,
        sales: 0,
        material: 0,
        outsource: p.amount ?? 0,
        projectId: p.id,
        order: order++,
      },
    });
  }

  return NextResponse.json({ imported: targets.length });
}
