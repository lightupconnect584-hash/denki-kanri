import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role: string }).role;

  const projects = await prisma.project.findMany({
    where: role === "ADMIN" ? {} : { assignedToId: userId, status: { not: "REJECTED" } },
    include: {
      assignedTo: { select: { name: true, companyName: true } },
      createdBy: { select: { name: true, avatarUrl: true } },
      inspections: { include: { photos: true } },
      quotes: true,
      comments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = (session.user as { id: string }).id;
  const body = await req.json();

  const project = await prisma.project.create({
    data: {
      title: body.title,
      location: body.location,
      contractorName: body.contractorName || null,
      contractorPhone: body.contractorPhone || null,
      smsAllowed: body.smsAllowed ?? false,
      description: body.description,
      urgency: body.urgency || "LOW",
      amount: body.amount ? parseInt(body.amount) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      assignedToId: body.assignedToId || null,
      createdById: userId,
      status: "PENDING",
      projectPhotos: {
        create: (body.photos || []).map((p: { filename: string; originalName: string }) => ({
          filename: p.filename,
          originalName: p.originalName,
        })),
      },
    },
  });

  return NextResponse.json(project);
}
