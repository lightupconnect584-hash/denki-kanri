import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Google OAuthコールバック: code→refresh_token交換して保存
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || "https://denki-kanri.vercel.app";
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(`${baseUrl}/login`);
  const userId = (session.user as { id: string }).id;

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("google_oauth_state")?.value;
  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(`${baseUrl}/settings?google=error`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/google/callback`,
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.refresh_token) {
      console.error("[google/callback] token error:", tokens);
      return NextResponse.redirect(`${baseUrl}/settings?google=error`);
    }

    // 連携アカウントのメールを取得
    let email: string | null = null;
    try {
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) email = (await infoRes.json()).email || null;
    } catch { /* ignore */ }

    await prisma.user.update({
      where: { id: userId },
      data: { googleRefreshToken: tokens.refresh_token, googleEmail: email },
    });

    return NextResponse.redirect(`${baseUrl}/settings?google=ok`);
  } catch (e) {
    console.error("[google/callback] error:", e);
    return NextResponse.redirect(`${baseUrl}/settings?google=error`);
  }
}
