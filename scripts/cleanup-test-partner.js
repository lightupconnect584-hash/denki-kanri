// テスト検証の後片付け: 案件をS・K・Dに戻し、テストアカウントを削除
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  await prisma.project.update({
    where: { id: "cms0o346h000110ee1epsv5xf" },
    data: { assignedToId: "cmonz0lyv0000orhp75vyavh6" },
  });
  console.log("グラン・アーク -> S・K・D に復元");
  await prisma.user.delete({ where: { id: "cmvd99p520000rcp5yq2ios73" } });
  console.log("テストアカウント削除完了");
  await prisma.$disconnect();
})();
