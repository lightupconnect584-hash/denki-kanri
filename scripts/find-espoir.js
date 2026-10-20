require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const ps = await prisma.project.findMany({
    where: { title: { contains: "エスポワール" } },
    select: { id: true, title: true, status: true, visitDate: true, visitTime: true, workType: true,
      assignedTo: { select: { name: true, companyName: true } } },
    orderBy: { createdAt: "desc" },
  });
  for (const p of ps) console.log(JSON.stringify({ id: p.id, title: p.title, status: p.status, visit: p.visitDate, time: p.visitTime, work: p.workType, who: p.assignedTo?.companyName || p.assignedTo?.name }));
  await prisma.$disconnect();
})();
