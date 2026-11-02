require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  await prisma.project.update({ where: { id: "cmvgeg7di0004o8var1ffc53l" }, data: { billingMonth: null } });
  console.log("エクセレンスI -> 未締めに戻した（売上行は2026-11のまま）");
  await prisma.$disconnect();
})();
