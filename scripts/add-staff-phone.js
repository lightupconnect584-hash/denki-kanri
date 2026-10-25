// 担当者番号リストに追加（折り返し先の自動除外＋管理ページの📞照合に使われる）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const item = await prisma.staffPhone.upsert({
    where: { phone: "08057658943" },
    update: { label: "山田（埼玉）" },
    create: { phone: "08057658943", label: "山田（埼玉）" },
  });
  console.log(`登録: ${item.label} ${item.phone}`);
  await prisma.$disconnect();
})();
