// 2026-08 の売上明細を一覧表示（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const entries = await prisma.salesEntry.findMany({
    where: { yearMonth: "2026-08" },
    select: { id: true, label: true, sales: true, invoiced: true },
    orderBy: { order: "asc" },
  });
  for (const e of entries) {
    console.log(`${e.id}\t${e.label}\t¥${e.sales}\t${e.invoiced ? "請求済" : ""}`);
  }
  await prisma.$disconnect();
})();
