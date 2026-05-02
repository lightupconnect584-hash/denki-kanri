import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, companyName: true, email: true } },
      createdBy: { select: { name: true } },
      projectPhotos: true,
      inspections: {
        include: {
          photos: true,
          inspector: { select: { name: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      quotes: {
        include: {
          submittedBy: { select: { name: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  await prisma.photo.deleteMany({ where: { inspection: { projectId: id } } });
  await prisma.inspection.deleteMany({ where: { projectId: id } });
  await prisma.quote.deleteMany({ where: { projectId: id } });
  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId;
  if (body.visitDate !== undefined) updateData.visitDate = body.visitDate ? new Date(body.visitDate) : null;

  const project = await prisma.project.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(project);
}
