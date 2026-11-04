require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const us = await prisma.user.findMany({
    where: { role: "PARTNER" },
    select: { name: true, companyName: true, createdAt: true, password: true, serviceAreas: true },
    orderBy: { createdAt: "desc" },
  });
  us.forEach(u => console.log(`${u.name} / ${u.companyName || "-"} / 登録${u.createdAt.toISOString().slice(0,10)} / ${u.password ? "登録済" : "招待中"} / エリア${(u.serviceAreas||[]).length}件`));
  await prisma.$disconnect();
})();
