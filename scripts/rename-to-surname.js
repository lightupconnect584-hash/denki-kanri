// 協力会社の表示名を苗字だけに統一（SMSの名乗り用）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const renames = [["金子友也", "金子"], ["茂澤　隆", "茂澤"]];
  for (const [from, to] of renames) {
    const r = await prisma.user.updateMany({ where: { name: from, role: "PARTNER" }, data: { name: to } });
    console.log(`${from} -> ${to}: ${r.count}件`);
  }
  await prisma.$disconnect();
})();
