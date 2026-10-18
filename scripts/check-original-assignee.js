require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const u = await prisma.user.findUnique({ where: { id: "cmonz0lyv0000orhp75vyavh6" }, select: { name: true, companyName: true, role: true } });
  console.log(JSON.stringify(u));
  await prisma.$disconnect();
})();
