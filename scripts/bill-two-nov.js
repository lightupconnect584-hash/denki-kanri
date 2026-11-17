require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  for (const id of ["cmvtattaj0001dnxlr16rxhhm", "cmvu6tsvr0001jugnqp5up3wl"]) {
    const p = await prisma.project.update({ where: { id }, data: { billingMonth: "2026-11" }, select: { title: true, billingMonth: true } });
    console.log(`${p.title} -> 請求月 ${p.billingMonth}`);
  }
  await prisma.$disconnect();
})();
