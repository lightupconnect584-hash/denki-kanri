// エスポワール・フルール A（S・K・D・進行中）に訪問日 2026-10-22 を設定
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const p = await prisma.project.update({
    where: { id: "cmvggsqv30001jg1cifp2ovtq" },
    data: { visitDate: new Date("2026-10-22T00:00:00.000Z") },
    select: { title: true, status: true, visitDate: true, assignedTo: { select: { companyName: true } } },
  });
  console.log(`${p.title} [${p.status}] ${p.visitDate.toISOString().slice(0,10)} 担当:${p.assignedTo?.companyName}`);
  await prisma.$disconnect();
})();
