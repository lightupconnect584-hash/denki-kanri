import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put, del } from "@vercel/blob";
import { sendPushToUsers, getAdminIds } from "@/lib/push";

export const maxDuration = 60;

// 依頼書の受付ボックス（管理者専用・ペーパーレス受付→振り分け）

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if ((session.user as { role?: string })?.role !== "ADMIN") return null;
  return session;
}

// GET: ?id=xxx で1件、なしで未振り分け一覧
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const doc = await prisma.intakeDoc.findUnique({ where: { id } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(doc);
  }
  const docs = await prisma.intakeDoc.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(docs);
}

// POST: 依頼書ファイルを受付（アップロード）
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = (session.user as { id: string }).id;
  const userName = (session.user as { name?: string }).name || "管理者";

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });

  const blob = await put(file.name, file, { access: "public", addRandomSuffix: true });

  const doc = await prisma.intakeDoc.create({
    data: {
      filename: blob.url,
      originalName: file.name,
      createdByName: userName,
    },
  });

  // 他の管理者に通知（振り分け担当へ）
  try {
    const adminIds = (await getAdminIds()).filter((a) => a !== userId);
    if (adminIds.length > 0) {
      await sendPushToUsers(adminIds, {
        title: "📥 依頼書が受付されました",
        body: `${userName} が依頼書を受付しました。振り分けをお願いします`,
        url: "/dashboard",
      });
    }
  } catch { /* 通知失敗は無視 */ }

  return NextResponse.json(doc);
}

// PATCH: 振り分け完了（案件に紐付け）
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, projectId } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const doc = await prisma.intakeDoc.update({
    where: { id },
    data: { status: "PROCESSED", projectId: projectId || null },
  });
  return NextResponse.json(doc);
}

// DELETE: 受付を取り消し（誤アップロード用）
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const doc = await prisma.intakeDoc.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (doc.filename.startsWith("http")) await del(doc.filename);
  } catch { /* ignore */ }
  await prisma.intakeDoc.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
