// 川越/アンペアの案件を検索（読み取りのみ）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const projects = await prisma.project.findMany({
    where: { OR: [{ title: { contains: "アンペア" } }, { location: { contains: "川越" } }, { workType: { contains: "アンペア" } }] },
    select: { id: true, title: true, location: true, workType: true, status: true, visitDate: true, visitTime: true,
      assignedTo: { select: { name: true, companyName: true } } },
  });
  console.log(JSON.stringify(projects, null, 1));
  await prisma.$disconnect();
})();
