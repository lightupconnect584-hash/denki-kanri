require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  for (const id of ["cmvtattaj0001dnxlr16rxhhm", "cmvu6tsvr0001jugnqp5up3wl"]) {
    const max = await prisma.salesEntry.aggregate({ where: { yearMonth: "2026-11" }, _max: { order: true } });
    const se = await prisma.salesEntry.update({
      where: { projectId: id },
      data: { yearMonth: "2026-11", order: (max._max.order ?? -1) + 1 },
    });
    console.log(`${se.label} -> ${se.yearMonth} (売上¥${se.sales} 外注¥${se.outsource})`);
  }
  await prisma.$disconnect();
})();
