import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { list } from "@vercel/blob";

const DB_LIMIT = 500 * 1024 * 1024;
const BLOB_LIMIT = 500 * 1024 * 1024;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // DB容量
  const dbResult = await prisma.$queryRaw<{ size: bigint }[]>`
    SELECT pg_database_size(current_database()) AS size
  `;
  const dbBytes = Number(dbResult[0].size);

  // Blob容量（全ファイルを合算）
  let blobBytes = 0;
  let cursor: string | undefined;
  do {
    const res = await list({ limit: 1000, cursor });
    for (const blob of res.blobs) blobBytes += blob.size;
    cursor = res.cursor;
  } while (cursor);

  return NextResponse.json({
    db: { used: dbBytes, limit: DB_LIMIT },
    blob: { used: blobBytes, limit: BLOB_LIMIT },
  });
}
