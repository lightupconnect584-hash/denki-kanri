import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const include = {
  category: true,
  createdBy: { select: { id: true, name: true, companyName: true, avatarUrl: true } },
  updatedBy: { select: { id: true, name: true, companyName: true, avatarUrl: true } },
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";

  const items = await prisma.replacementModel.findMany({
    where: q
      ? {
          OR: [
            { existingModel: { contains: q, mode: "insensitive" } },
            { replacementModel: { contains: q, mode: "insensitive" } },
            { maker: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include,
    orderBy: { createdAt: "desc" },
  });

  let relatedProjects: { id: string; title: string; location: string; workType: string | null; status: string }[] = [];
  if (q) {
    relatedProjects = await prisma.project.findMany({
      where: {
        OR: [
          { workType: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true, location: true, workType: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  return NextResponse.json({ items, relatedProjects });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string })?.id;

  const body = await req.json();
  const item = await prisma.replacementModel.create({
    data: {
      existingModel: body.existingModel,
      replacementModel: body.replacementModel,
      maker: body.maker || null,
      color: body.color || null,
      price: body.price !== undefined && body.price !== "" && body.price !== null ? parseInt(body.price) : null,
      replacementCost: body.replacementCost !== undefined && body.replacementCost !== "" && body.replacementCost !== null ? parseInt(body.replacementCost) : null,
      relatedParts: Array.isArray(body.relatedParts) ? body.relatedParts : [],
      notes: body.notes || null,
      updatedOn: body.updatedOn ? new Date(body.updatedOn) : null,
      categoryId: body.categoryId || null,
      createdById: userId || null,
      updatedById: userId || null,
    },
    include,
  });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string })?.id;

  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const item = await prisma.replacementModel.update({
    where: { id },
    data: {
      existingModel: rest.existingModel,
      replacementModel: rest.replacementModel,
      maker: rest.maker || null,
      color: rest.color || null,
      price: rest.price !== undefined && rest.price !== "" && rest.price !== null ? parseInt(rest.price) : null,
      replacementCost: rest.replacementCost !== undefined && rest.replacementCost !== "" && rest.replacementCost !== null ? parseInt(rest.replacementCost) : null,
      relatedParts: Array.isArray(rest.relatedParts) ? rest.relatedParts : [],
      notes: rest.notes || null,
      updatedOn: rest.updatedOn ? new Date(rest.updatedOn) : null,
      categoryId: rest.categoryId || null,
      updatedById: userId || null,
    },
    include,
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.replacementModel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
