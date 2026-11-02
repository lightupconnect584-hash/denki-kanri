require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const ps = await prisma.project.findMany({
    where: { title: { contains: "エクセレンス" } },
    select: { id: true, title: true, status: true, amount: true, salesAmount: true, billingMonth: true, visitDate: true,
      assignedTo: { select: { name: true, role: true } },
      inspections: { select: { workDate: true, result: true } } },
    orderBy: { createdAt: "desc" },
  });
  for (const p of ps) {
    console.log(JSON.stringify(p, null, 1));
    const se = await prisma.salesEntry.findUnique({ where: { projectId: p.id } });
    console.log("SalesEntry:", se ? `${se.yearMonth} sales=${se.sales} outsource=${se.outsource} invoiced=${se.invoiced}` : "なし");
  }
  await prisma.$disconnect();
})();
