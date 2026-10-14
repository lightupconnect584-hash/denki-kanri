// DBサイズの確認（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const size = await prisma.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
  console.log("DB size:", size[0].size);
  const counts = await Promise.all([
    prisma.project.count(), prisma.inspection.count(), prisma.photo.count(),
    prisma.salesEntry.count(), prisma.directMessage.count(), prisma.comment.count().catch(() => -1),
  ]);
  console.log(`projects=${counts[0]} inspections=${counts[1]} photoRows=${counts[2]} salesEntries=${counts[3]} DMs=${counts[4]} comments=${counts[5]}`);
  await prisma.$disconnect();
})();
