require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const id = "cmv4rxba60001fpe2xd0gjzwi";
  await prisma.project.update({ where: { id }, data: { billingMonth: "2026-11" } });
  const max = await prisma.salesEntry.aggregate({ where: { yearMonth: "2026-11" }, _max: { order: true } });
  const se = await prisma.salesEntry.update({
    where: { projectId: id },
    data: { yearMonth: "2026-11", order: (max._max.order ?? -1) + 1 },
  });
  console.log(`アンテナ一式交換 -> ${se.yearMonth} (sales=${se.sales})`);
  await prisma.$disconnect();
})();
