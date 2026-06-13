import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

// A4: 595.28 x 841.89 pt
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LABEL_W = 150;

const urgencyLabel = (u: string) => (u === "HIGH" ? "高" : u === "MEDIUM" ? "中" : "低");

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// テキストを指定幅で折り返し（フォント幅計測ベース）
function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const ch of raw) {
      const candidate = current + ch;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current !== "") {
        lines.push(current);
        current = ch;
      } else {
        current = candidate;
      }
    }
    if (current !== "") lines.push(current);
  }
  return lines;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: role === "PARTNER" ? { id, assignedToId: userId } : { id },
    include: {
      assignedTo: { select: { name: true, companyName: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 日本語フォント読み込み
  const fontPath = path.join(process.cwd(), "fonts", "NotoSansJP-Subset.ttf");
  const fontBytes = await fs.readFile(fontPath);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // subset: true はモバイルPDFビューアで文字化けするため全埋め込み（フォント自体をJIS範囲に縮小済み）
  const font = await doc.embedFont(fontBytes, { subset: false });
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const black = rgb(0.07, 0.07, 0.07);
  const gray = rgb(0.45, 0.45, 0.45);
  const lineGray = rgb(0.55, 0.55, 0.55);
  const headBg = rgb(0.94, 0.94, 0.94);

  // タイトル
  const title = "依　頼　書";
  const titleSize = 22;
  page.drawText(title, {
    x: (PAGE_W - font.widthOfTextAtSize(title, titleSize)) / 2,
    y: PAGE_H - MARGIN - titleSize,
    size: titleSize,
    font,
    color: black,
  });

  // 発行日（右寄せ）
  const issued = `発行日: ${fmtDate(project.createdAt)}`;
  page.drawText(issued, {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(issued, 9),
    y: PAGE_H - MARGIN - titleSize - 20,
    size: 9,
    font,
    color: gray,
  });

  // 表の行データ
  const rows: [string, string][] = [
    ["依頼名", project.workType || ""],
    ["入居者名", project.contractorName || ""],
    ["連絡先", project.contractorPhone || ""],
    ["ショートメールでの連絡", project.smsAllowed ? "可" : "不可"],
    ["物件名・住所", `${project.location}${project.roomNumber ? `　${project.roomNumber}` : ""}`],
    ["連絡希望日時", project.preferredContactAt || ""],
    ["訪問希望", project.preferredVisitAt || ""],
    ["入居開始日", project.moveInDate || ""],
    ["緊急度", urgencyLabel(project.urgency)],
    ["材料支給", project.materialSupplied ? "あり" : "なし"],
    ["期日", fmtDate(project.dueDate)],
    ["担当", project.assignedTo ? project.assignedTo.companyName || project.assignedTo.name : ""],
  ];

  const fontSize = 10;
  const cellPadX = 8;
  const cellPadY = 7;
  const lineHeight = fontSize * 1.45;
  const valueW = CONTENT_W - LABEL_W - cellPadX * 2;

  let y = PAGE_H - MARGIN - titleSize - 38; // 表の上端

  const tableTop = y;
  const rowBounds: number[] = [y];

  for (const [label, value] of rows) {
    const valLines = value ? wrapText(value, font, fontSize, valueW) : [""];
    const rowH = Math.max(1, valLines.length) * lineHeight + cellPadY * 2 - (lineHeight - fontSize);

    // ラベルセル背景
    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: LABEL_W,
      height: rowH,
      color: headBg,
    });

    // ラベル
    page.drawText(label, {
      x: MARGIN + cellPadX,
      y: y - cellPadY - fontSize,
      size: fontSize,
      font,
      color: black,
    });

    // 値（折り返し）
    valLines.forEach((line, i) => {
      if (!line) return;
      page.drawText(line, {
        x: MARGIN + LABEL_W + cellPadX,
        y: y - cellPadY - fontSize - i * lineHeight,
        size: fontSize,
        font,
        color: black,
      });
    });

    y -= rowH;
    rowBounds.push(y);
  }

  // 表の罫線
  for (const by of rowBounds) {
    page.drawLine({
      start: { x: MARGIN, y: by },
      end: { x: MARGIN + CONTENT_W, y: by },
      thickness: 0.7,
      color: lineGray,
    });
  }
  for (const x of [MARGIN, MARGIN + LABEL_W, MARGIN + CONTENT_W]) {
    page.drawLine({
      start: { x, y: tableTop },
      end: { x, y },
      thickness: 0.7,
      color: lineGray,
    });
  }

  // 依頼内容ブロック
  y -= 18;
  const descLabelH = fontSize + cellPadY * 2;
  const descLines = project.description
    ? wrapText(project.description, font, fontSize, CONTENT_W - cellPadX * 2)
    : [];
  const minBodyH = 110;
  const bodyH = Math.max(minBodyH, descLines.length * lineHeight + cellPadY * 2);
  const blockH = descLabelH + bodyH;
  const blockBottom = Math.max(MARGIN, y - blockH);

  // 見出し背景
  page.drawRectangle({
    x: MARGIN,
    y: y - descLabelH,
    width: CONTENT_W,
    height: descLabelH,
    color: headBg,
  });
  page.drawText("依頼内容", {
    x: MARGIN + cellPadX,
    y: y - cellPadY - fontSize,
    size: fontSize,
    font,
    color: black,
  });

  // 枠線
  page.drawRectangle({
    x: MARGIN,
    y: blockBottom,
    width: CONTENT_W,
    height: y - blockBottom,
    borderColor: lineGray,
    borderWidth: 0.7,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - descLabelH },
    end: { x: MARGIN + CONTENT_W, y: y - descLabelH },
    thickness: 0.7,
    color: lineGray,
  });

  // 本文（ページからはみ出る分は省略）
  let ty = y - descLabelH - cellPadY - fontSize;
  for (const line of descLines) {
    if (ty < blockBottom + cellPadY - 2) break;
    if (line) {
      page.drawText(line, { x: MARGIN + cellPadX, y: ty, size: fontSize, font, color: black });
    }
    ty -= lineHeight;
  }

  const pdfBytes = await doc.save();

  const filename = encodeURIComponent(`依頼書_${project.workType || project.title}.pdf`);
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
