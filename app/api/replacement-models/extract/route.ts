import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

// 後継品案内・銘板写真・カタログ等から機種情報を抽出する
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI機能が未設定です" }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

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
      existingModel: { type: "string", description: "既存（旧）機種の型番。銘板写真なら写っている型番。不明なら空文字" },
      replacementModel: { type: "string", description: "後継品・代替品の型番。後継品案内に記載があれば。不明なら空文字" },
      maker: { type: "string", description: "メーカー名（例: 三菱電機、パナソニック）。不明なら空文字" },
      color: { type: "string", description: "色（例: ホワイト）。不明なら空文字" },
      relatedParts: { type: "array", items: { type: "string" }, description: "同時交換が必要な関連部材の型番一覧。なければ空配列" },
      notes: { type: "string", description: "交換時の注意事項があれば簡潔に。なければ空文字" },
    },
    required: ["existingModel", "replacementModel", "maker", "color", "relatedParts", "notes"],
  };

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content: [
            docBlock,
            {
              type: "text",
              text:
                "これは電気設備機器の後継品案内・カタログ・銘板写真のいずれかです。" +
                "記載されている機種情報を指定のJSON項目で抽出してください。" +
                "型番は英数字・ハイフンをそのまま正確に書き写してください。" +
                "読み取れない項目は空文字（配列は空配列）にし、推測で埋めないでください。",
            },
          ],
        },
      ],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
    const data = JSON.parse(raw);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[replacement-models/extract] error:", e);
    return NextResponse.json({ error: "読み取りに失敗しました" }, { status: 500 });
  }
}
