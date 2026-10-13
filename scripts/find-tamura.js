// ヒラガ/田村 の売上明細を検索（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const entries = await prisma.salesEntry.findMany({
    where: { OR: [{ label: { contains: "田村" } }, { label: { contains: "ヒラガ" } }, { label: { contains: "ひらが" } }, { label: { contains: "平賀" } }] },
    select: { id: true, label: true, yearMonth: true, sales: true, invoiced: true, projectId: true, clientId: true },
  });
  console.log(JSON.stringify(entries, null, 1));
  // 案件名でも検索
  const projects = await prisma.project.findMany({
    where: { OR: [{ title: { contains: "田村" } }, { title: { contains: "ヒラガ" } }, { title: { contains: "平賀" } }] },
    select: { id: true, title: true, status: true, client: { select: { name: true } } },
  });
  console.log(JSON.stringify(projects, null, 1));
  await prisma.$disconnect();
})();
