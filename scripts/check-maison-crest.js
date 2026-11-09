require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const ps = await prisma.project.findMany({
    where: { title: { contains: "クレスト" } },
    select: { id: true, title: true, status: true, notifyAdminAt: true, notifyPartnerAt: true,
      contactRequired: true, contactTag: true, afterContactRequired: true, afterContactedAt: true,
      onHold: true, visitDate: true, createdAt: true,
      assignedTo: { select: { name: true, role: true } },
      inspections: { select: { id: true, result: true, workDate: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  ps.forEach(p => console.log(JSON.stringify(p, null, 1)));
  await prisma.$disconnect();
})();
