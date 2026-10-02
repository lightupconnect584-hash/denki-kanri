import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put, del } from "@vercel/blob";
import { sendPushToUsers, getAdminIds } from "@/lib/push";

export const maxDuration = 60;

// GET: 月締め請求書一覧（管理者は全協力会社、協力会社は自分の分）
//   ?month=YYYY-MM で月を絞り込み（省略時は全件）
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  const userId = (session.user as { id: string }).id;

  const month = req.nextUrl.searchParams.get("month");

  const invoices = await prisma.monthlyInvoice.findMany({
    where: {
      ...(role === "PARTNER" ? { partnerId: userId } : {}),
      ...(month ? { yearMonth: month } : {}),
    },
    include: { partner: { select: { id: true, name: true, companyName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(invoices);
}

// POST: 月締め請求書をアップロード（協力会社のみ）
//   formData: file, month(YYYY-MM)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  const userId = (session.user as { id: string }).id;
  if (role !== "PARTNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const month = formData.get("month") as string;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "月が不正です" }, { status: 400 });
  }

  const blob = await put(file.name, file, { access: "public", addRandomSuffix: true });

  const invoice = await prisma.monthlyInvoice.create({
    data: {
      yearMonth: month,
      filename: blob.url,
      originalName: file.name,
      partnerId: userId,
    },
  });

  // 管理者へ通知（支払い漏れ防止）
  try {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, companyName: true } });
    const who = me?.companyName || me?.name || "協力会社";
    const [y, m] = month.split("-");
    const adminIds = await getAdminIds();
    await sendPushToUsers(adminIds, {
      title: "🧾 請求書が届きました",
      body: `${who}から${parseInt(m)}月分の請求書が添付されました`,
      url: "/billing",
    });
    void y;
  } catch { /* 通知失敗は無視 */ }

  return NextResponse.json(invoice);
}

// PATCH: 支払い完了チェックの切り替え（管理者のみ）
//   { invoiceId, paid: boolean }
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { invoiceId, paid } = await req.json();
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  const invoice = await prisma.monthlyInvoice.update({
    where: { id: invoiceId },
    data: { paidAt: paid ? new Date() : null },
  });
  // 支払い完了をその協力会社へ通知（チェックを外した時は通知しない）
  if (paid) {
    try {
      const [, m] = invoice.yearMonth.split("-");
      await sendPushToUsers([invoice.partnerId], {
        title: "💰 お支払い完了",
        body: `${parseInt(m)}月分のお支払いが完了しました`,
        url: "/billing",
      });
    } catch { /* 通知失敗は無視 */ }
  }
  return NextResponse.json(invoice);
}

// DELETE: 月締め請求書を削除（管理者、またはアップロードした協力会社）
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  const userId = (session.user as { id: string }).id;

  const { invoiceId } = await req.json();
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });

  const invoice = await prisma.monthlyInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role !== "ADMIN" && invoice.partnerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (invoice.filename.startsWith("http")) await del(invoice.filename);
  } catch {
    // ignore
  }
  await prisma.monthlyInvoice.delete({ where: { id: invoiceId } });
  return NextResponse.json({ ok: true });
}
