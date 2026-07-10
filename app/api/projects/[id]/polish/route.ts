import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

// 協力会社の完了報告を、積水ハウス向けの報告文にAIで清書する（管理者のみ）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI機能が未設定です" }, { status: 500 });
  }

  const { id } = await params;
  const body = await req.json();
  const inspectionId = String(body.inspectionId || "");
  if (!inspectionId) return NextResponse.json({ error: "inspectionId required" }, { status: 400 });

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, projectId: id },
    include: {
      project: {
        select: { title: true, roomNumber: true, location: true, workType: true },
      },
    },
  });
  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = inspection.project;
  const workDates =
    inspection.workDates.length > 0
      ? inspection.workDates.map((d) => new Date(d).toLocaleDateString("ja-JP")).join("、")
      : new Date(inspection.workDate).toLocaleDateString("ja-JP");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `あなたは電気工事会社の事務担当です。協力会社から届いた作業完了報告（現場のメモ書き）を、元請の積水ハウスへ送る完了報告文に清書してください。

# 清書のルール
- 事実のみを書く。元の報告に書かれていないことを推測で追加しない
- 話し言葉・メモ書きを、簡潔で丁寧な報告書調の日本語に直す（です・ます調）
- 誤字脱字・表記ゆれを修正する
- 専門用語はそのまま使ってよい
- 冗長な言い回しは削り、要点が伝わる長さにする
- 挨拶文や署名は不要。報告本文のみ
- 以下のフォーマットで出力する（【その他】は元の報告にある場合のみ）

# 出力フォーマット
【物件名】（物件名 部屋番号）
【作業日】（作業日）
【状況】
（清書した状況）
【原因】
（清書した原因）
【対応】
（清書した対応内容）

# 案件情報
物件名: ${p.title}${p.roomNumber ? ` ${p.roomNumber}` : ""}
住所: ${p.location}
依頼名: ${p.workType || "（未設定）"}
作業日: ${workDates}
作業結果: ${inspection.result === "OK" ? "問題なし（完了）" : "要修理・要対応"}

# 協力会社からの報告（原文）
${inspection.notes || "（記載なし）"}`;

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    if (!text) return NextResponse.json({ error: "清書に失敗しました" }, { status: 500 });

    await prisma.inspection.update({
      where: { id: inspectionId },
      data: { polishedReport: text },
    });
    return NextResponse.json({ text });
  } catch (e) {
    console.error("[polish] error:", e);
    return NextResponse.json({ error: "清書に失敗しました" }, { status: 500 });
  }
}

// PATCH: 清書文を手動で編集して保存（管理者のみ）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const inspectionId = String(body.inspectionId || "");
  if (!inspectionId) return NextResponse.json({ error: "inspectionId required" }, { status: 400 });

  const inspection = await prisma.inspection.findFirst({ where: { id: inspectionId, projectId: id } });
  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { polishedReport: String(body.text ?? "") || null },
  });
  return NextResponse.json({ ok: true });
}
