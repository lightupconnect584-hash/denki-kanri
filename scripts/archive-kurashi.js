// くらしのマーケットをアーカイブ（退会のため。過去データは残す）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const c = await prisma.client.update({
    where: { id: "cmrugg0380002okxvcg2brk0o" },
    data: { archived: true },
  });
  console.log(`archived: ${c.name}`);
  await prisma.$disconnect();
})();
