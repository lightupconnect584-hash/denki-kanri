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

  const contentType = req.headers.get("content-type") || "";
  let bytes: Buffer;
  let fileType = "";
  let fileName = "";

  if (contentType.includes("application/json")) {
    // URLドロップ：サーバー側で取得
    const body = await req.json().catch(() => ({}));
    const url = String(body.url || "");
    if (!/^https?:\/\//.test(url)) {
      return NextResponse.json({ error: "URLが不正です" }, { status: 400 });
    }
    try {
      const r = await fetch(url);
      if (!r.ok) return NextResponse.json({ error: "URLからファイルを取得できませんでした" }, { status: 400 });
      fileType = r.headers.get("content-type") || "";
      bytes = Buffer.from(await r.arrayBuffer());
      fileName = url.split("?")[0];
    } catch {
      return NextResponse.json({ error: "URLからファイルを取得できませんでした" }, { status: 400 });
    }
    if (!fileType.includes("pdf") && !fileType.startsWith("image/") && !fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "PDF・画像のURLではありません" }, { status: 400 });
    }
  } else {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
    bytes = Buffer.from(await file.arrayBuffer());
    fileType = file.type;
    fileName = file.name;
  }

  const base64 = bytes.toString("base64");
  const isPdf = fileType === "application/pdf" || fileType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");

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
          media_type: (fileType || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
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
      moveInDate: { type: "string", description: "入居開始日・入居日・入居予定日という項目の【日付】のみ（例: 2026/7/1、R8.7.1）。『入居区分』『入居状況』『入居中/空室』などの区分・状態の語は絶対に入れない。日付が書かれていなければ空文字。日付以外の文字列は入れない" },
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
                "moveInDate（入居開始日）には日付のみを入れてください。『入居区分』『入居状況』『空室/入居中』などの区分・状態は入居開始日ではないので絶対に入れないでください。" +
                "入居開始日の日付が書かれていない場合は必ず空文字にしてください。" +
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
    // moveInDateは日付を含む値のみ採用（「入居区分」等の混入を防ぐ）
    if (data && typeof data.moveInDate === "string" && data.moveInDate.trim()) {
      const hasDate = /\d{1,4}[年./\-]\s*\d{1,2}|[RHS令平昭]\d?\s*[.年]|\d{1,2}\s*月/.test(data.moveInDate);
      if (!hasDate) data.moveInDate = "";
    }
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[extract] error:", e);
    return NextResponse.json({ error: "読み取りに失敗しました" }, { status: 500 });
  }
}
