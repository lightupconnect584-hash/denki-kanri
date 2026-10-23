require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const us = await prisma.user.findMany({ select: { name: true, companyName: true, role: true }, orderBy: { role: "asc" } });
  for (const u of us) console.log(`${u.role} | 名前:「${u.name}」 | 会社:「${u.companyName || "-"}」`);
  await prisma.$disconnect();
})();
