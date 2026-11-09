require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const p = await prisma.project.findUnique({
    where: { id: "cmw1fcqva0001km72s1kwnx49" },
    select: { status: true, visitDate: true, contactRequired: true, contactTag: true, contactedAt: true,
      afterContactRequired: true, afterContactedAt: true, updatedAt: true, onHold: true, holdAt: true, assignedToId: true },
  });
  console.log(JSON.stringify(p, null, 1));
  await prisma.$disconnect();
})();
