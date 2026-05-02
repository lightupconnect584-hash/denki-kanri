import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id: string }).id;
  const body = await req.json();

  const quote = await prisma.quote.create({
    data: {
      projectId: id,
      submittedById: userId,
      amount: body.amount ? parseInt(body.amount) : null,
      notes: body.notes,
      filename: body.filename,
      status: "PENDING",
    },
  });

  await prisma.project.update({
    where: { id },
    data: { status: "QUOTE_RECEIVED" },
  });

  return NextResponse.json(quote);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const quote = await prisma.quote.update({
    where: { id: body.quoteId },
    data: { status: body.status },
  });

  if (body.status === "APPROVED") {
    await prisma.project.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
  } else if (body.status === "REJECTED") {
    await prisma.project.update({
      where: { id },
      data: { status: "REJECTED" },
    });
  }

  return NextResponse.json(quote);
}
