// 「未設定 → 」で始まる金額変更ログを削除（初回設定は変更ではない）
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const r = await prisma.activityLog.deleteMany({
    where: { action: "AMOUNT_CHANGED", detail: { startsWith: "未設定 →" } },
  });
  console.log(`deleted: ${r.count}件`);
  await prisma.$disconnect();
})();
