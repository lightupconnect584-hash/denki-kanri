// クレールメゾン　Ｇ（進行中・ACCEPTED）に訪問日 2026-11-07 10:00〜 を設定
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const p = await prisma.project.update({
    where: { id: "cmqiuodzp000312kr7r1cs48t" },
    data: { visitDate: new Date("2026-11-07T00:00:00.000Z"), visitTime: "10:00〜" },
    select: { title: true, status: true, visitDate: true, visitTime: true, assignedTo: { select: { name: true, companyName: true } } },
  });
  console.log(`${p.title} [${p.status}] ${p.visitDate.toISOString().slice(0,10)} ${p.visitTime} 担当:${p.assignedTo?.companyName || p.assignedTo?.name || "未割当"}`);
  await prisma.$disconnect();
})();
