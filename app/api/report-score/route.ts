import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

// 完了報告の下書きをAIが100点満点で採点し、不足項目を返す（送信前の自己チェック用）
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI機能が未設定です" }, { status: 500 });
  }

  const body = await req.json();
  const {
    situation = "", cause = "", response = "", materials = "",
    insulation = "", clamp = "", repairProposal = "", needQuote = false,
    photos = { before: 0, during: 0, after: 0 },
  } = body || {};

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `あなたは電気工事の完了報告の品質チェックAIです。協力会社が入力した報告の下書きを100点満点で採点し、不足している項目を指摘してください。

# 採点の観点
・現場状況が具体的に書かれているか（何が・どこで・どうなったか）
・原因が記載されているか（不明の場合「原因不明」と明記されていれば減点しない）
・実施内容が具体的か（交換／切り離し／測定など何をしたか明確か）
・測定値（絶縁抵抗値・クランプ値）があるか ※電気工事として重要
・使用部材が記載されているか（部材を使った作業の場合）
・写真が揃っているか（点検前・点検中・点検後）
・修理提案や見積の要否が判断できるか
・誤解を生む曖昧な表現がないか

# ルール
・推測せず、入力の有無と具体性のみで採点する
・不足項目は短い言葉で列挙（例：「修理後写真なし」「測定値なし」「使用部材未入力」「原因が曖昧」）
・良い報告なら素直に高得点をつける。完璧なら100点
・不足がなければ missing は空配列

# 報告の下書き
現場状況: ${situation || "（未入力）"}
原因: ${cause || "（未入力）"}
実施内容: ${response || "（未入力）"}
使用部材: ${materials || "（未入力）"}
絶縁抵抗値: ${insulation || "（未入力）"}
クランプ値: ${clamp || "（未入力）"}
修理提案: ${repairProposal || "（未入力）"}
見積り: ${needQuote ? "必要" : "不要"}
写真: 点検前${photos.before || 0}枚 / 点検中${photos.during || 0}枚 / 点検後${photos.after || 0}枚`;

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 800,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              score: { type: "integer", description: "報告品質の点数（0〜100）" },
              missing: { type: "array", items: { type: "string" }, description: "不足項目の一覧（短い言葉で）。なければ空配列" },
            },
            required: ["score", "missing"],
          },
        },
      },
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
    const data = JSON.parse(raw) as { score?: number; missing?: string[] };
    return NextResponse.json({
      score: Math.max(0, Math.min(100, Number(data.score) || 0)),
      missing: data.missing || [],
    });
  } catch (e) {
    console.error("[report-score] error:", e);
    return NextResponse.json({ error: "採点に失敗しました" }, { status: 500 });
  }
}
