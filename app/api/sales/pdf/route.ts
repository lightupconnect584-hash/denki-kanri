import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PDFDocument, rgb, PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

// A4縦
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 44;

// 列: 建物名 | 売上 | 材料費 | 外注費 | 利益（右揃え数値）
const COL_NUM_W = 82;
const COL_LABEL_W = PAGE_W - MARGIN * 2 - COL_NUM_W * 4;

const fmt = (n: number) => n.toLocaleString();

// 売上集計ページのPDF出力（管理者のみ）
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const month = req.nextUrl.searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }

  const [entries, expenses, clients] = await Promise.all([
    prisma.salesEntry.findMany({ where: { yearMonth: month }, orderBy: { order: "asc" } }),
    prisma.expenseItem.findMany({ orderBy: { order: "asc" } }),
    prisma.client.findMany({ orderBy: { order: "asc" } }),
  ]);

  const feePct = new Map(clients.map((c) => [c.id, c.feePercent || 0]));
  const feeOf = (e: { clientId: string | null; sales: number }) => {
    const pct = e.clientId ? (feePct.get(e.clientId) || 0) : 0;
    return pct > 0 ? Math.round((e.sales * pct) / 100) : 0;
  };

  // 集計
  const revenue = entries.reduce((s, e) => s + e.sales, 0);
  const material = entries.reduce((s, e) => s + e.material, 0);
  const outsource = entries.reduce((s, e) => s + e.outsource, 0);
  const fee = entries.reduce((s, e) => s + feeOf(e), 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const cost = material + outsource + fee + expenseTotal;
  const profit = revenue - cost;
  const gross = revenue - material - outsource - fee;
  const grossRate = revenue > 0 ? Math.round((gross / revenue) * 100) : null;
  const profitRate = revenue > 0 ? Math.round((profit / revenue) * 100) : null;

  // PDF準備
  const fontBytes = await fs.readFile(path.join(process.cwd(), "fonts", "NotoSansJP-Subset.ttf"));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });

  const GRAY = rgb(0.45, 0.45, 0.45);
  const DARK = rgb(0.12, 0.12, 0.12);
  const LINE = rgb(0.8, 0.8, 0.8);
  const RED = rgb(0.75, 0.15, 0.15);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPageIfNeeded = (need: number) => {
    if (y - need < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };
  const text = (t: string, x: number, size: number, opts?: { color?: ReturnType<typeof rgb>; rightAt?: number }) => {
    const color = opts?.color ?? DARK;
    const x2 = opts?.rightAt !== undefined ? opts.rightAt - font.widthOfTextAtSize(t, size) : x;
    page.drawText(t, { x: x2, y, size, font, color });
  };
  const hline = (yy: number, color = LINE) => {
    page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness: 0.5, color });
  };

  // タイトル
  const [yy, mm] = month.split("-");
  const title = `売上集計　${yy}年${parseInt(mm)}月`;
  text(title, MARGIN, 18);
  const issued = `出力日: ${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "/")}`;
  text(issued, 0, 9, { color: GRAY, rightAt: PAGE_W - MARGIN });
  y -= 30;

  // サマリー
  const sums: [string, string, ReturnType<typeof rgb>][] = [
    ["収益", `¥${fmt(revenue)}`, DARK],
    ["粗利率", grossRate != null ? `${grossRate}%（粗利 ¥${fmt(gross)}）` : "-", DARK],
    ["経費計", `¥${fmt(cost)}`, DARK],
    ["利益", `¥${fmt(profit)}${profitRate != null ? `（利益率 ${profitRate}%）` : ""}`, profit >= 0 ? DARK : RED],
  ];
  for (const [label, val, color] of sums) {
    text(label, MARGIN, 10, { color: GRAY });
    text(val, MARGIN + 70, 11, { color });
    y -= 16;
  }
  y -= 8;

  // 明細（取引先ごと）
  const groups: { name: string; pct: number; items: typeof entries }[] = [];
  for (const c of clients) {
    const items = entries.filter((e) => e.clientId === c.id);
    if (items.length > 0) groups.push({ name: c.name, pct: c.feePercent || 0, items });
  }
  const others = entries.filter((e) => !e.clientId || !clients.some((c) => c.id === e.clientId));
  if (others.length > 0) groups.push({ name: "その他", pct: 0, items: others });

  const drawRow = (label: string, s: number | null, m: number | null, o: number | null, p: number | null, opts?: { bold?: boolean; profitRed?: boolean }) => {
    newPageIfNeeded(16);
    const size = opts?.bold ? 9.5 : 9;
    // 建物名は幅に収まるように切り詰め
    let name = label;
    while (name && font.widthOfTextAtSize(name, size) > COL_LABEL_W - 6) name = name.slice(0, -1);
    if (name !== label) name += "…";
    text(name || "（名称なし）", MARGIN, size);
    const cols = [s, m, o, p];
    cols.forEach((v, i) => {
      if (v === null) return;
      const right = MARGIN + COL_LABEL_W + COL_NUM_W * (i + 1);
      text(fmt(v), 0, size, { rightAt: right, color: i === 3 && (opts?.profitRed || v < 0) ? RED : DARK });
    });
    y -= 14;
  };

  for (const g of groups) {
    newPageIfNeeded(60);
    // 取引先見出し
    text(g.name + (g.pct > 0 ? `（手数料${g.pct}%）` : ""), MARGIN, 11);
    y -= 16;
    // ヘッダー行
    const heads = ["建物名・内容", "売上", "材料費", "外注費", "利益"];
    text(heads[0], MARGIN, 8.5, { color: GRAY });
    heads.slice(1).forEach((h, i) => text(h, 0, 8.5, { color: GRAY, rightAt: MARGIN + COL_LABEL_W + COL_NUM_W * (i + 1) }));
    y -= 4;
    hline(y);
    y -= 12;

    let sub = { sales: 0, material: 0, outsource: 0, fee: 0 };
    for (const e of g.items) {
      const rowFee = feeOf(e);
      const p = e.sales - e.material - e.outsource - rowFee;
      drawRow(e.label || "", e.sales, e.material, e.outsource, p);
      sub = { sales: sub.sales + e.sales, material: sub.material + e.material, outsource: sub.outsource + e.outsource, fee: sub.fee + rowFee };
    }
    if (sub.fee > 0) {
      drawRow(`プラットフォーム手数料（${g.pct}%）`, null, null, null, -sub.fee);
    }
    newPageIfNeeded(18);
    hline(y + 10);
    const subProfit = sub.sales - sub.material - sub.outsource - sub.fee;
    drawRow("小計", sub.sales, sub.material, sub.outsource, subProfit, { bold: true });
    y -= 10;
  }

  // 経費一覧
  if (expenses.length > 0) {
    newPageIfNeeded(40 + expenses.length * 14);
    text("経費（毎月共通）", MARGIN, 11);
    y -= 16;
    hline(y + 4);
    y -= 8;
    for (const ex of expenses) {
      newPageIfNeeded(16);
      text(ex.label, MARGIN, 9);
      text(fmt(ex.amount), 0, 9, { rightAt: MARGIN + COL_LABEL_W + COL_NUM_W });
      y -= 14;
    }
    hline(y + 10);
    drawRow("経費合計", expenseTotal, null, null, null, { bold: true });
  }

  const bytes = await doc.save();
  const filename = encodeURIComponent(`売上集計_${yy}-${mm}.pdf`);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
    },
  });
}
