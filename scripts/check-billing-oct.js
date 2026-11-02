require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const done = await prisma.project.findMany({
    where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { title: true, billingMonth: true, amount: true, assignedTo: { select: { name: true, role: true } }, inspections: { select: { workDate: true } } },
  });
  const byMonth = {};
  for (const p of done) {
    const k = p.billingMonth || "未締め";
    byMonth[k] = byMonth[k] || [];
    byMonth[k].push(p);
  }
  for (const k of Object.keys(byMonth).sort()) {
    console.log(`\n== ${k} (${byMonth[k].length}件) ==`);
    if (k === "未締め" || k === "2026-10") {
      byMonth[k].forEach(p => {
        const wd = p.inspections.map(i => i.workDate.toISOString().slice(0,10)).sort().pop() || "-";
        console.log(`  ${p.title} / ${p.assignedTo?.name}(${p.assignedTo?.role}) / 作業${wd} / ¥${p.amount}`);
      });
    }
  }
  await prisma.$disconnect();
})();
