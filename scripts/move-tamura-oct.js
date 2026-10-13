// ヒラガコーポレーション「田村さん」(¥166,000)を2026-09→2026-10へ移動＋計上月固定
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const max = await prisma.salesEntry.aggregate({ where: { yearMonth: "2026-10" }, _max: { order: true } });
  const e = await prisma.salesEntry.update({
    where: { id: "cmv655p5q0001nyymlx39v8nd" },
    data: { yearMonth: "2026-10", order: (max._max.order ?? 0) + 1 },
    select: { label: true, yearMonth: true },
  });
  console.log(`moved: ${e.label} -> ${e.yearMonth}`);
  await prisma.project.update({ where: { id: "cms1ejkgg0001b1cviquwwp58" }, data: { billingMonth: "2026-10" } });
  console.log("billingMonth set: 2026-10");
  await prisma.$disconnect();
})();
