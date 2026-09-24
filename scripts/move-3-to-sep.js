// 8月売上の3件（ドレミはいむB / フェリーチェ フィオーレ / クレスト）を2026-09へ移動
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const IDS = [
  "cmu69y6470001rtdoda2smi4l", // ドレミ はいむ B
  "cmu4oqc1200011lhkf1d2qtjq", // フェリーチェ　フィオーレ
  "cmu6abvc40001zyer40henz7v", // クレスト
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
