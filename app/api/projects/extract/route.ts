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
      location: { type: "string", description: "工事対象の【物件（現場）の住所】。建物名・部屋番号がある物件そのものの所在地。郵便番号（〒や123-4567）は含めず、都道府県以降の住所だけにする。依頼元・支店・管理会社・折り返し先・積水ハウスの会社住所は絶対に入れない。物件住所が読み取れなければ空文字" },
      roomNumber: { type: "string", description: "部屋番号・号室。不明なら空文字" },
      contractorName: { type: "string", description: "『折り返し先』『連絡先』欄に書かれた氏名（カナ）。管理担当者名・アフター担当者名・入居者名など他の氏名欄とは混同しない。文字が不鮮明で確実に読めない場合は推測せず空文字。読めた文字だけを正確に書き写す" },
      contractorPhone: { type: "string", description: "折り返し先電話番号。不明なら空文字" },
      description: { type: "string", description: "依頼内容・不具合の内容（例: 廊下の照明が点灯しない、ブレーカーが落ちる）。記載の文章を簡潔にまとめてよいが、書かれていないことは追加しない。不明なら空文字" },
      moveInDate: { type: "string", description: "入居開始日・入居日・入居予定日という項目の【日付】のみ（例: 2026/7/1、R8.7.1）。『入居区分』『入居状況』『入居中/空室』などの区分・状態の語は絶対に入れない。日付が書かれていなければ空文字。日付以外の文字列は入れない" },
      preferredContactAt: { type: "string", description: "連絡希望日時（あれば）。不明なら空文字" },
      receivedAt: { type: "string", description: "受付日時（依頼を受け付けた日時。文字列そのまま）。不明なら空文字" },
      smsAllowed: { type: "boolean", description: "ショートメッセージ（SMS）での連絡が可能か。可・OK等の記載があればtrue、不可・記載なしはfalse" },
      managerName: { type: "string", description: "管理担当者名（依頼元の管理担当者。『管理担当』等の項目）。不明なら空文字" },
      afterManagerName: { type: "string", description: "アフター担当者名（『アフター担当』等の項目）。不明なら空文字" },
      contactRequired: { type: "boolean", description: "入居者とのアポイント（立ち会い・在宅・日程調整）が必要な作業か。『立ち会い』『在宅』『入居者と日程調整』などの記載があればtrue。空室・立ち会い不要ならfalse" },
      region: { type: "string", enum: ["埼玉", "北関東", ""], description: "依頼元のエリア。書類の発行元・支店名・住所から判断：埼玉（埼玉県）なら「埼玉」、北関東（栃木県・茨城県・群馬県）なら「北関東」。判断できなければ空文字" },
    },
    required: [
      "title", "location", "roomNumber",
      "contractorName", "contractorPhone", "description",
      "moveInDate", "preferredContactAt", "receivedAt", "smsAllowed",
      "managerName", "afterManagerName", "region", "contactRequired",
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
                "金額・料金・社内管理番号などは抽出しないでください（管理担当者名・アフター担当者名は抽出対象です）。" +
                "location（住所）は、工事対象の物件（現場）の住所だけを抽出してください。書類には依頼元・支店・管理会社・折り返し先・積水ハウスの会社住所など複数の住所が載っていることがありますが、それらは絶対に入れないでください。建物名・部屋番号がある物件そのものの所在地を選んでください。物件の住所が判別できなければ空文字にしてください。" +
                "moveInDate（入居開始日）には日付のみを入れてください。『入居区分』『入居状況』『空室/入居中』などの区分・状態は入居開始日ではないので絶対に入れないでください。" +
                "入居開始日の日付が書かれていない場合は必ず空文字にしてください。" +
                "読み取れる項目はきちんと読み取ってください。ただし、かすれ・ぼやけで文字がまったく判読できない項目や、書類に記載自体がない項目は、無理に似た文字で推測せず空文字にしてください。",
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
