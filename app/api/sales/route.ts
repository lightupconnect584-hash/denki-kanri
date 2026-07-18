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

  const [entries, expenses] = await Promise.all([
    prisma.salesEntry.findMany({ where: { yearMonth: month }, orderBy: { order: "asc" } }),
    prisma.expenseItem.findMany({ orderBy: { order: "asc" } }),
  ]);

  // 依頼書原本（受付アーカイブ）を各行に結合（請求書作成時に原本を見ながら作れるように）
  const projectIds = entries.map((e) => e.projectId).filter((v): v is string => !!v);
  const docs = projectIds.length > 0
    ? await prisma.intakeDoc.findMany({
        where: { projectId: { in: projectIds }, status: "PROCESSED" },
        select: { projectId: true, filename: true, originalName: true },
      })
    : [];
  const docMap = new Map(docs.map((d) => [d.projectId, d]));
  const entriesWithDoc = entries.map((e) => ({
    ...e,
    docUrl: e.projectId ? docMap.get(e.projectId)?.filename || null : null,
  }));
  return NextResponse.json({ entries: entriesWithDoc, expenses });
}

// POST: 明細行を追加
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const month = String(body.yearMonth || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }
  const category = CATEGORIES.includes(body.category) ? body.category : "SEKISUI_KITA";

  const max = await prisma.salesEntry.aggregate({
    where: { yearMonth: month },
    _max: { order: true },
  });

  const entry = await prisma.salesEntry.create({
    data: {
      yearMonth: month,
      category,
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
