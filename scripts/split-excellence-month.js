require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const id = "cmvgeg7di0004o8var1ffc53l";
  // 協力会社（茂澤さん）への支払いは10月請求分として固定
  await prisma.project.update({ where: { id }, data: { billingMonth: "2026-10" } });
  // 積水への請求（売上行）は11月へ移動
  const max = await prisma.salesEntry.aggregate({ where: { yearMonth: "2026-11" }, _max: { order: true } });
  const se = await prisma.salesEntry.update({
    where: { projectId: id },
    data: { yearMonth: "2026-11", order: (max._max.order ?? -1) + 1 },
  });
  console.log(`billingMonth=2026-10 / SalesEntry -> ${se.yearMonth} (sales=${se.sales}, outsource=${se.outsource})`);
  await prisma.$disconnect();
})();
