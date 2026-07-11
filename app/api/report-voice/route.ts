import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

// 話し言葉の報告（音声入力の文字起こし）を、完了報告の各項目に振り分ける
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI機能が未設定です" }, { status: 500 });
  }

  const body = await req.json();
  const transcript = String(body.transcript || "").trim();
  if (!transcript) return NextResponse.json({ error: "音声テキストがありません" }, { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `あなたは電気工事の完了報告の入力支援AIです。作業者が話した内容（音声入力の文字起こし）を、報告フォームの各項目に振り分けてください。

# ルール
・話された事実のみを使う。推測で補完しない
・話にない項目は空文字にする
・話し言葉を簡潔な書き言葉に直してよいが、内容は変えない
・言い直し・フィラー（えーと、あのー等）は除去する
・測定値は数値と単位をそのまま抜き出す（例: 0.5MΩ以上、3.2A）
・「見積り必要」「見積り出す」等の発言があれば needQuote を true に

# 振り分け先
- situation: 現場状況（何が起きていたか）
- cause: 原因（話者が原因として述べたことのみ）
- response: 実施内容（実際にやった作業）
- materials: 使用部材（交換・使用した部品）
- insulation: 絶縁抵抗値
- clamp: クランプ値
- repairProposal: 修理提案・今後必要な対応
- needQuote: 見積りが必要か（boolean）
- other: どの項目にも当てはまらない特記事項

# 話した内容
${transcript}`;

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              situation: { type: "string" },
              cause: { type: "string" },
              response: { type: "string" },
              materials: { type: "string" },
              insulation: { type: "string" },
              clamp: { type: "string" },
              repairProposal: { type: "string" },
              needQuote: { type: "boolean" },
              other: { type: "string" },
            },
            required: ["situation", "cause", "response", "materials", "insulation", "clamp", "repairProposal", "needQuote", "other"],
          },
        },
      },
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
    return NextResponse.json({ data: JSON.parse(raw) });
  } catch (e) {
    console.error("[report-voice] error:", e);
    return NextResponse.json({ error: "振り分けに失敗しました" }, { status: 500 });
  }
}
