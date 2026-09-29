// 8月売上の3件（ドレミはいむB / フェリーチェ フィオーレ / クレスト）を2026-09へ移動
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const IDS = [
  "cmtxxpi4w00015agcms0ek9hj", // きりみさん
];

(async () => {
  const max = await prisma.salesEntry.aggregate({
    where: { yearMonth: "2026-09" },
    _max: { order: true },
  });
  let order = (max._max.order ?? 0) + 1;
  for (const id of IDS) {
    const e = await prisma.salesEntry.update({
      where: { id },
      data: { yearMonth: "2026-09", order: order++ },
      select: { label: true, yearMonth: true },
    });
    console.log(`moved: ${e.label} -> ${e.yearMonth}`);
  }
  await prisma.$disconnect();
})();
