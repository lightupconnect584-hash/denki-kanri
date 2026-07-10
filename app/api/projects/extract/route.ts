import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

// 依頼元のPDF/画像から、依頼登録に必要な項目だけを抽出する（管理者のみ）
// 金額・依頼元の社内情報など見せたくない項目は抽出しない
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI機能が未設定です" }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  // 抽出対象のドキュメント（PDF or 画像）ブロック
  const docBlock = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: base64,
        },
      };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "物件名・建物名（例: ブリリアントヴィレッジ）。不明なら空文字" },
      location: { type: "string", description: "住所（市区町村＋番地）。不明なら空文字" },
      roomNumber: { type: "string", description: "部屋番号・号室。不明なら空文字" },
      contractorName: { type: "string", description: "折り返し先名（カナ）。入居者・連絡担当者の氏名カナ。不明なら空文字" },
      contractorPhone: { type: "string", description: "折り返し先電話番号。不明なら空文字" },
      moveInDate: { type: "string", description: "入居開始日（あれば。文字列そのまま）。不明なら空文字" },
      preferredContactAt: { type: "string", description: "連絡希望日時（あれば）。不明なら空文字" },
      receivedAt: { type: "string", description: "受付日時（依頼を受け付けた日時。文字列そのまま）。不明なら空文字" },
      smsAllowed: { type: "boolean", description: "ショートメッセージ（SMS）での連絡が可能か。可・OK等の記載があればtrue、不可・記載なしはfalse" },
    },
    required: [
      "title", "location", "roomNumber",
      "contractorName", "contractorPhone",
      "moveInDate", "preferredContactAt", "receivedAt", "smsAllowed",
    ],
  };

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content: [
            docBlock,
            {
              type: "text",
              text:
                "これは電気工事の依頼元から届いた依頼書です。記載内容から、指定のJSON項目だけを抽出してください。" +
                "金額・料金・依頼元の社内担当者名・社内管理番号などは抽出しないでください。" +
                "読み取れない項目は空文字にしてください。推測で埋めないでください。",
            },
          ],
        },
      ],
    });

    // 構造化出力のテキストをJSONとしてパース
    const textBlock = res.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
    const data = JSON.parse(raw);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[extract] error:", e);
    return NextResponse.json({ error: "読み取りに失敗しました" }, { status: 500 });
  }
}
