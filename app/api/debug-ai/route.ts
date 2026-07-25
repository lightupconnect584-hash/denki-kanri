import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

// 一時的なAIキー動作確認用（確認後に削除する）
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("t") !== "907b8ba945d53a72e5f942913794fbafcb9b1858927809d1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, reason: "no-key" });
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 20,
      messages: [{ role: "user", content: "OKとだけ返して" }],
    });
    const t = res.content.find((b) => b.type === "text");
    return NextResponse.json({ ok: true, text: t && t.type === "text" ? t.text : "" });
  } catch (e) {
    const status = (e as { status?: number }).status;
    return NextResponse.json({ ok: false, status, message: String((e as Error).message).slice(0, 200) });
  }
}
