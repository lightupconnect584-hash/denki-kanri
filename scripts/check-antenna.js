require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const ps = await prisma.project.findMany({
    where: { title: { contains: "アンテナ" } },
    select: { id: true, title: true, status: true, amount: true, salesAmount: true, billingMonth: true,
      assignedTo: { select: { name: true, role: true } },
      inspections: { select: { workDate: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  for (const p of ps) {
    const se = await prisma.salesEntry.findUnique({ where: { projectId: p.id } });
    console.log(p.title, "|", p.status, "| 担当", p.assignedTo?.name, "| billingMonth", p.billingMonth,
      "| 作業", p.inspections.map(i=>i.workDate.toISOString().slice(0,10)).join(","),
      "| SalesEntry", se ? `${se.yearMonth} sales=${se.sales} outsource=${se.outsource}` : "なし", "| id", p.id);
  }
  await prisma.$disconnect();
})();
