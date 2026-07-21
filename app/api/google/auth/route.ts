import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { randomBytes } from "crypto";

// Googleカレンダー連携の開始（同意画面へリダイレクト）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "https://denki-kanri.vercel.app"));
  if (!process.env.GOOGLE_CLIENT_ID) {
    return new NextResponse("Google連携が未設定です（GOOGLE_CLIENT_ID）", { status: 500 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || "https://denki-kanri.vercel.app";
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl}/api/google/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events email",
    access_type: "offline",
    prompt: "consent", // 毎回refresh_tokenを確実に取得
    state,
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, maxAge: 600, path: "/" });
  return res;
}
