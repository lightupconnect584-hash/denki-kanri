// 川越アンペア変更工事に訪問日 2026-10-29 10:00〜 を設定
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const p = await prisma.project.update({
    where: { id: "cmu96prnt0003jd1od9z0hj2r" },
    data: { visitDate: new Date("2026-10-29T00:00:00.000Z"), visitTime: "10:00〜" },
    select: { title: true, visitDate: true, visitTime: true },
  });
  console.log(`${p.title}: ${p.visitDate.toISOString().slice(0, 10)} ${p.visitTime}`);
  await prisma.$disconnect();
})();
