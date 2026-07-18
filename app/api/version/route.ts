import { NextResponse } from "next/server";

// デプロイのバージョン識別子を返す（クライアントの自動アップデート用）
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    v: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev",
  });
}
