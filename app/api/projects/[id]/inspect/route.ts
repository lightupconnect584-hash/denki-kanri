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

  const inspection = await prisma.inspection.create({
    data: {
      projectId: id,
      inspectorId: userId,
      result: body.result,
      workDate: new Date(body.workDate),
      notes: body.notes,
      photos: {
        create: (body.photos || []).map((p: { filename: string; originalName: string }) => ({
          filename: p.filename,
          originalName: p.originalName,
        })),
      },
    },
    include: { photos: true },
  });

  const newStatus = body.result === "REPAIR_NEEDED" ? "QUOTE_REQUESTED" : "INSPECTED";
  await prisma.project.update({
    where: { id },
    data: { status: newStatus },
  });

  return NextResponse.json(inspection);
}
