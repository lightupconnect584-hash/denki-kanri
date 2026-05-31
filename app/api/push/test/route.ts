import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/push";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  await sendPushToUsers([userId], {
    title: "🔔 通知テスト",
    body: "通知の設定が完了しました！",
    url: "/dashboard",
  });

  return NextResponse.json({ ok: true });
}
