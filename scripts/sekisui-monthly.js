// 積水案件の月間完了件数（売上明細ベース＝計上月）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const clients = await prisma.client.findMany({ where: { name: { contains: "積水" } }, select: { id: true, name: true } });
  const ids = clients.map((c) => c.id);
  const rows = await prisma.salesEntry.groupBy({
    by: ["yearMonth"],
    where: { clientId: { in: ids } },
    _count: true,
    orderBy: { yearMonth: "asc" },
  });
  for (const r of rows) console.log(`${r.yearMonth}: ${r._count}件`);
  await prisma.$disconnect();
})();
