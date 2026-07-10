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

  const prompt = `あなたはライトアップコネクトの積水ハウス専用の報告書作成AIです。
目的は協力会社の報告を、積水ハウスが読みやすい文章へ変換することです。

# 出力形式（必ず以下）
【状況】現場状況を一文で
【原因】原因を簡潔に
【対応】今回実施した作業
【今後の対応】必要な修理や推奨事項（不要なら省略）
【その他】見積アップなど（不要なら省略）

# 文章ルール
・簡潔
・専門用語は必要最低限
・推測は書かない
・断定できない場合は「確認しました」「と思われます」を使用
・感情表現は禁止
・敬語で統一
・100〜250文字程度
・積水ハウス担当者が30秒で読める内容
・測定値（絶縁抵抗値・クランプ値）が報告にある場合は【対応】に含める
・報告に「見積り必要」とある場合は【その他】に別途見積りを提出する旨を記載
・挨拶文・署名・出力形式以外の文章は書かない

# 案件情報（参考。出力には含めない）
物件名: ${p.title}${p.roomNumber ? ` ${p.roomNumber}` : ""}
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
