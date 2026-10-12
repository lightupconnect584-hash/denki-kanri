// くらしのマーケット関連のデータを確認（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const clients = await prisma.client.findMany({
    where: { name: { contains: "くらし" } },
  });
  for (const c of clients) {
    const projCount = await prisma.project.count({ where: { clientId: c.id } });
    const entryCount = await prisma.salesEntry.count({ where: { clientId: c.id } });
    const entriesByMonth = await prisma.salesEntry.groupBy({
      by: ["yearMonth"],
      where: { clientId: c.id },
      _count: true,
    });
    console.log(JSON.stringify({ id: c.id, name: c.name, archived: c.archived, feePercent: c.feePercent, order: c.order, projects: projCount, salesEntries: entryCount, months: entriesByMonth }, null, 1));
  }
  if (clients.length === 0) console.log("Clientに該当なし");
  await prisma.$disconnect();
})();
