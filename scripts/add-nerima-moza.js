require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const u = await prisma.user.findFirst({ where: { companyName: "MOZAwork" }, select: { id: true, serviceAreas: true } });
  if (!u) { console.log("not found"); process.exit(1); }
  const areas = Array.from(new Set([...(u.serviceAreas || []), "練馬区"]));
  await prisma.user.update({ where: { id: u.id }, data: { serviceAreas: areas } });
  console.log("MOZAwork serviceAreas:", areas.join("・"));
  await prisma.$disconnect();
})();
