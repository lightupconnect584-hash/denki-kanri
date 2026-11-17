require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const ps = await prisma.project.findMany({
    where: { OR: [{ title: { contains: "ベルドミール" } }, { title: { contains: "わんピース" } }, { title: { contains: "ワンピース" } }] },
    select: { id: true, title: true, status: true, billingMonth: true, amount: true, salesAmount: true,
      assignedTo: { select: { name: true, role: true } }, inspections: { select: { workDate: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  for (const p of ps) {
    const se = await prisma.salesEntry.findUnique({ where: { projectId: p.id } });
    console.log(p.title, "|", p.status, "|", p.assignedTo?.name, "| bill", p.billingMonth,
      "| 作業", p.inspections.map(i => i.workDate.toISOString().slice(0,10)).join(","),
      "| SE", se ? `${se.yearMonth} s=${se.sales} o=${se.outsource}` : "なし", "|", p.id);
  }
  await prisma.$disconnect();
})();
