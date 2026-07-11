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
目的は協力会社が入力した内容を、積水ハウス担当者が読みやすい報告書へ変換することです。
あなたは文章を考えるのではなく、現場情報を整理・清書する役割です。判断は人間が行います。

【最重要】
あなたは事実のみを文章化します。
絶対に推測してはいけません。
入力されていない情報を追加してはいけません。
勝手に部材名を追加してはいけません。
勝手に原因を決めてはいけません。
勝手に修理内容を変更してはいけません。
原因が分からない場合は「現時点では原因の特定には至りませんでした。」としてください。
作業していない内容を書いてはいけません。
交換していないのに交換したと書いてはいけません。
切り離しと交換を間違えてはいけません。

# 文章ルール
・簡潔で分かりやすい文章
・専門用語は必要最低限
・感情表現は禁止、敬語で統一
・積水ハウス担当者が30秒以内で読める長さ
・毎回同じ品質・同じ構成で作成する
・測定値（絶縁抵抗値・クランプ値）が入力にある場合は【対応】に含める
・「見積り必要」とある場合は【その他】に見積書を提出する旨を記載
・挨拶文・署名は不要

# 出力（report フィールド。必ず以下の構成）
【状況】現場で発生していた症状（例：共用灯回路の漏電によるブレーカー落ち）
【原因】判明している場合のみ。不明なら「現時点では原因の特定には至りませんでした。」
【対応】現場で実施した内容のみ（例：漏電箇所を切り離し復旧、絶縁測定実施）
【今後の対応】必要な場合のみ（例：ポール灯交換を推奨）。不要なら省略
【その他】必要に応じて（例：見積書はアップロードしました。現在は復旧済みです）。不要なら省略

# 判断できなかった事項（uncertainties フィールド）
入力内容だけでは判断できない事項があれば、文章を補完せず一覧にする。なければ空配列。
例：「原因の記載なし」「現在の復旧状況不明」「交換か切り離しか判断できない」「測定値なし」「見積有無不明」

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
      max_tokens: 2000,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              report: { type: "string", description: "清書した報告書本文（【状況】〜の構成）" },
              uncertainties: { type: "array", items: { type: "string" }, description: "入力内容から判断できなかった事項の一覧。なければ空配列" },
            },
            required: ["report", "uncertainties"],
          },
        },
      },
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
    const data = JSON.parse(raw) as { report?: string; uncertainties?: string[] };
    const text = (data.report || "").trim();
    if (!text) return NextResponse.json({ error: "清書に失敗しました" }, { status: 500 });

    await prisma.inspection.update({
      where: { id: inspectionId },
      data: { polishedReport: text },
    });
    return NextResponse.json({ text, uncertainties: data.uncertainties || [] });
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
