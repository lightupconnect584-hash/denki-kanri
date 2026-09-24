// 移動した3件の案件のbillingMonthを2026-09に設定（再同期で8月へ戻らないように）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const IDS = [
  "cmu69y6470001rtdoda2smi4l",
  "cmu4oqc1200011lhkf1d2qtjq",
  "cmu6abvc40001zyer40henz7v",
];

(async () => {
  for (const id of IDS) {
    const e = await prisma.salesEntry.findUnique({ where: { id }, select: { projectId: true, label: true } });
    if (!e?.projectId) { console.log(`no project: ${e?.label}`); continue; }
    await prisma.project.update({ where: { id: e.projectId }, data: { billingMonth: "2026-09" } });
    console.log(`billingMonth set: ${e.label}`);
  }
  await prisma.$disconnect();
})();
