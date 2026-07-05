import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 管理者専用チェックリスト（協力会社はアクセス不可）

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== "ADMIN") return null;
  return session;
}

// POST: タスク追加。{ label } 単体、または { labels: string[] }（テンプレ一括）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const labels: string[] = Array.isArray(body.labels)
    ? body.labels
    : body.label
      ? [body.label]
      : [];
  const cleaned = labels.map((l) => String(l).trim()).filter(Boolean);
  if (cleaned.length === 0) return NextResponse.json({ error: "label required" }, { status: 400 });

  const maxOrder = await prisma.adminTask.aggregate({
    where: { projectId: id },
    _max: { order: true },
  });
  let order = (maxOrder._max.order ?? -1) + 1;

  const tasks = [];
  for (const label of cleaned) {
    tasks.push(
      await prisma.adminTask.create({
        data: { projectId: id, label, order: order++ },
      })
    );
  }
  return NextResponse.json(tasks);
}

// PATCH: チェックON/OFF・ラベル変更 { taskId, done?, label? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  if (!body.taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const data: { done?: boolean; label?: string } = {};
  if (body.done !== undefined) data.done = Boolean(body.done);
  if (body.label !== undefined && String(body.label).trim()) data.label = String(body.label).trim();

  const task = await prisma.adminTask.update({
    where: { id: body.taskId, projectId: id },
    data,
  });
  return NextResponse.json(task);
}

// DELETE: タスク削除 { taskId }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { taskId } = await req.json();
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  await prisma.adminTask.delete({ where: { id: taskId, projectId: id } });
  return NextResponse.json({ ok: true });
}
