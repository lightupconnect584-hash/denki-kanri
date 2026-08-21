import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if ((session.user as { role?: string })?.role !== "ADMIN") return null;
  return session;
}

const CATEGORIES = ["SEKISUI_KITA", "SEKISUI_SAITAMA", "PERSONAL", "OTHER"];

// GET: 指定月の売上明細＋経費一覧
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const month = req.nextUrl.searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }

  const [entries, expenses, clients] = await Promise.all([
    prisma.salesEntry.findMany({ where: { yearMonth: month }, orderBy: { order: "asc" } }),
    prisma.expenseItem.findMany({ orderBy: { order: "asc" } }),
    prisma.client.findMany({ where: { archived: false }, orderBy: { order: "asc" } }),
  ]);

  // 依頼書原本（受付アーカイブ）を各行に結合（請求書作成時に原本を見ながら作れるように）
  const projectIds = entries.map((e) => e.projectId).filter((v): v is string => !!v);
  const docs = projectIds.length > 0
    ? await prisma.intakeDoc.findMany({
        where: { projectId: { in: projectIds }, status: "PROCESSED" },
        select: { id: true, projectId: true, originalName: true },
      })
    : [];
  const docMap = new Map(docs.map((d) => [d.projectId, d]));
  // 売上の作業日別内訳（請求書作成の参考用）も結合
  // 内訳未設定の案件でも、完了報告の作業日＋依頼名で内訳を表示できるようにする
  const breakdowns = projectIds.length > 0
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true, salesBreakdown: true, workType: true,
          inspections: { select: { workDate: true, workDates: true } },
        },
      })
    : [];
  const bdMap = new Map(breakdowns.map((b) => {
    const dates = new Set<string>();
    for (const insp of b.inspections) {
      if (insp.workDates.length > 0) {
        for (const d of insp.workDates) if (d) dates.add(d.slice(0, 10));
      } else if (insp.workDate) {
        dates.add(insp.workDate.toISOString().slice(0, 10));
      }
    }
    return [b.id, {
      salesBreakdown: Array.isArray(b.salesBreakdown) ? b.salesBreakdown : null,
      workType: b.workType,
      workDates: Array.from(dates).sort(),
    }] as const;
  }));
  const entriesWithDoc = entries.map((e) => {
    const doc = e.projectId ? docMap.get(e.projectId) : null;
    const bd = e.projectId ? bdMap.get(e.projectId) : null;
    return {
      ...e,
      docUrl: doc ? `/api/intake/view?id=${doc.id}` : null,
      docName: doc?.originalName || null,
      salesBreakdown: bd?.salesBreakdown ?? null,
      workType: bd?.workType ?? null,
      workDates: bd?.workDates ?? [],
    };
  });
  return NextResponse.json({ entries: entriesWithDoc, expenses, clients });
}

// POST: 明細行を追加
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const month = String(body.yearMonth || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }
  const category = CATEGORIES.includes(body.category) ? body.category : "OTHER";
  const clientId = body.clientId ? String(body.clientId) : null;

  const max = await prisma.salesEntry.aggregate({
    where: { yearMonth: month },
    _max: { order: true },
  });

  const entry = await prisma.salesEntry.create({
    data: {
      yearMonth: month,
      category,
      clientId,
      label: String(body.label ?? ""),
      sales: Number(body.sales) || 0,
      material: Number(body.material) || 0,
      outsource: Number(body.outsource) || 0,
      order: (max._max.order ?? -1) + 1,
    },
  });
  return NextResponse.json(entry);
}

// PATCH: 明細行を更新
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = String(body.label);
  if (body.sales !== undefined) data.sales = Number(body.sales) || 0;
  if (body.material !== undefined) data.material = Number(body.material) || 0;
  if (body.outsource !== undefined) data.outsource = Number(body.outsource) || 0;
  if (body.invoiced !== undefined) data.invoiced = Boolean(body.invoiced);
  if (body.category !== undefined && CATEGORIES.includes(body.category)) data.category = body.category;

  const entry = await prisma.salesEntry.update({ where: { id: body.id }, data });
  return NextResponse.json(entry);
}

// DELETE: 明細行を削除
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.salesEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
