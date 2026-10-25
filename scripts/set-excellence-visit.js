require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const ps = await prisma.project.findMany({
    where: { title: { contains: "エクセレンス" }, status: { notIn: ["CONFIRMED", "COMPLETED", "REJECTED"] } },
    select: { id: true, title: true, status: true, workType: true, assignedTo: { select: { name: true, companyName: true } } },
  });
  if (ps.length !== 1) { console.log("候補:", JSON.stringify(ps, null, 1)); process.exit(0); }
  const p = await prisma.project.update({
    where: { id: ps[0].id },
    data: { visitDate: new Date("2026-10-29T00:00:00.000Z") },
    select: { title: true, status: true, visitDate: true, visitTime: true, workType: true, assignedTo: { select: { companyName: true, name: true } } },
  });
  console.log(`${p.title} [${p.status}] ${p.workType} -> ${p.visitDate.toISOString().slice(0,10)} ${p.visitTime || ""} 担当:${p.assignedTo?.companyName || p.assignedTo?.name || "未割当"}`);
  await prisma.$disconnect();
})();
